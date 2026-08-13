/**
 * Artifact manifest and path containment tests (design §7.5; scenarios C06, C07).
 *
 * Symlink escape is the case a string check cannot catch, so it is exercised
 * against the real filesystem — skipped when the platform denies symlink creation
 * (unprivileged Windows), with the lexical defences still asserted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  artifactObjectPath,
  isInside,
  isSafeRelativePath,
  resolveRealPathWithinRoot,
  resolveWithinRoot,
  toPosix,
} from '../lib/paths.mjs';
import {
  checkManifestShape,
  manifestRelativePath,
  readManifestIndex,
  registerManifest,
  verifyArtifactIntegrity,
  verifyManifest,
} from '../lib/artifacts.mjs';
import {
  KERNEL_CODES,
  PathEscapeError,
  SemanticValidationError,
  SchemaValidationError,
} from '../lib/errors.mjs';
import { BUDGETS, SOFT_LIMITS } from '../lib/budgets.mjs';
import { sha256Bytes } from '../lib/canonical.mjs';
import { makeManifest, makeTaskRoot, writeArtifactFile } from './fixtures/kernel-fixtures.mjs';

function withTask(run) {
  const task = makeTaskRoot('agv2-artifacts-');
  try {
    return run(task.root);
  } finally {
    task.dispose();
  }
}

test('isSafeRelativePath accepts task-relative paths only', () => {
  for (const good of ['artifacts/a.txt', 'work/d-1/out.json', 'a', 'a/b/c/d.log']) {
    assert.equal(isSafeRelativePath(good), true, good);
  }
  for (const bad of [
    '../escape',
    'a/../../escape',
    '/absolute',
    'C:/windows',
    'c:\\windows',
    'a\\b',
    '..',
    'a/..',
    '',
    null,
    42,
  ]) {
    assert.equal(isSafeRelativePath(bad), false, String(bad));
  }
});

test('a path containing a null byte is rejected', () => {
  assert.equal(isSafeRelativePath('a\0b'), false);
});

test('a filename merely containing dots is allowed', () => {
  // '..' is only dangerous as a whole segment.
  assert.equal(isSafeRelativePath('artifacts/report..txt'), true);
  assert.equal(isSafeRelativePath('artifacts/..hidden'), true);
});

test('a drive-relative path is rejected even though it is not absolute', () => {
  // `C:/windows` and `c:\windows` are already caught by the absolute-path and backslash
  // rules, so they do not exercise the drive-letter rule at all. `C:relative` is the case
  // that needs it: Windows resolves it against the drive's *current* directory, so it is
  // neither absolute nor task-relative -- exactly the ambiguity the rule exists to refuse.
  for (const bad of ['C:relative/x', 'C:', 'c:x', 'Z:a/b']) {
    assert.equal(isSafeRelativePath(bad), false, bad);
  }
});

test('resolveWithinRoot returns an absolute path inside the root', () => {
  withTask((root) => {
    const resolved = resolveWithinRoot(root, 'artifacts/a.txt');
    assert.equal(path.isAbsolute(resolved), true);
    assert.equal(isInside(root, resolved), true);
  });
});

test('resolveWithinRoot rejects escapes and requires an absolute root (C07)', () => {
  withTask((root) => {
    for (const bad of ['../outside.txt', '/etc/passwd', 'a/../../out']) {
      assert.throws(() => resolveWithinRoot(root, bad), PathEscapeError, bad);
    }
    assert.throws(() => resolveWithinRoot('relative/root', 'a.txt'), PathEscapeError);
  });
});

test('isInside does not treat a sibling with a shared prefix as inside', () => {
  const root = path.join(tmpdir(), 'root');
  assert.equal(isInside(root, path.join(tmpdir(), 'root-evil', 'x')), false);
  assert.equal(isInside(root, path.join(root, 'x')), true);
  assert.equal(isInside(root, root), true);
});

test('toPosix normalizes separators for storage', () => {
  assert.equal(toPosix(path.join('artifacts', 'objects', 'ab', 'x.txt')), 'artifacts/objects/ab/x.txt');
});

test('artifactObjectPath shards by digest prefix and validates its inputs', () => {
  const digest = 'ab'.repeat(32);
  assert.equal(artifactObjectPath(digest, '.txt'), `artifacts/objects/ab/${digest}.txt`);
  assert.equal(artifactObjectPath(digest), `artifacts/objects/ab/${digest}`);
  assert.throws(() => artifactObjectPath('NOTHEX'), PathEscapeError);
  assert.throws(() => artifactObjectPath(digest, 'txt'), PathEscapeError);
  assert.throws(() => artifactObjectPath(digest, '../../etc'), PathEscapeError);
});

test('resolveRealPathWithinRoot accepts a real file inside the root', () => {
  withTask((root) => {
    const file = writeArtifactFile(root, 'body');
    const resolved = resolveRealPathWithinRoot(root, file.path);
    assert.equal(isInside(root, resolved), true);
  });
});

test('resolveRealPathWithinRoot rejects a missing file', () => {
  withTask((root) => {
    assert.throws(() => resolveRealPathWithinRoot(root, 'artifacts/ghost.txt'), PathEscapeError);
  });
});

test('a symlink pointing outside the root is rejected (C07)', (t) => {
  withTask((root) => {
    const outsideDir = path.join(tmpdir(), `agv2-outside-${process.pid}`);
    mkdirSync(outsideDir, { recursive: true });
    const secret = path.join(outsideDir, 'secret.txt');
    writeFileSync(secret, 'must not be read');

    const linkPath = path.join(root, 'artifacts', 'link.txt');
    mkdirSync(path.dirname(linkPath), { recursive: true });

    try {
      symlinkSync(secret, linkPath, 'file');
    } catch (cause) {
      // Unprivileged Windows cannot create symlinks; the lexical defences above
      // still apply, so skip rather than pretend this ran.
      rmSync(outsideDir, { recursive: true, force: true });
      t.skip(`symlink creation unavailable: ${cause.code}`);
      return;
    }

    try {
      // The string is a safe relative path, yet the real target escapes.
      assert.equal(isSafeRelativePath('artifacts/link.txt'), true);
      assert.throws(
        () => resolveRealPathWithinRoot(root, 'artifacts/link.txt'),
        (error) => {
          assert.ok(error instanceof PathEscapeError);
          assert.match(error.message, /symlink/);
          return true;
        },
      );
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

test('verifyManifest accepts a manifest matching disk', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'evidence body');
    const result = verifyManifest(root, manifest);
    assert.equal(result.actualBytes, manifest.bytes);
    assert.equal(result.actualSha256, manifest.sha256);
    assert.equal(result.softLimitExceeded, false);
  });
});

test('verifyManifest rejects a wrong digest (C06)', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'evidence body');
    assert.throws(
      () => verifyManifest(root, { ...manifest, sha256: 'b'.repeat(64) }),
      (error) => {
        assert.ok(error instanceof SemanticValidationError);
        assert.ok(error.violations.some((entry) => entry.invariant === 'digest_matches'));
        return true;
      },
    );
  });
});

test('verifyManifest rejects a wrong byte count', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'evidence body');
    assert.throws(
      () => verifyManifest(root, { ...manifest, bytes: 9999, original_bytes: 9999 }),
      (error) => {
        assert.ok(error instanceof SemanticValidationError);
        // Naming the invariant, not just the error class: a bare `SemanticValidationError`
        // assertion passes when the byte check is reported as `digest_matches`, so it cannot
        // tell a correct rejection from a rejection for the wrong stated reason. Measured --
        // renaming `bytes_match` to `digest_matches` left the whole suite green.
        assert.ok(
          error.violations.some((entry) => entry.invariant === 'bytes_match'),
          `expected bytes_match, got ${JSON.stringify(error.violations)}`,
        );
        return true;
      },
    );
  });
});

test('verifyManifest rejects a manifest whose file does not exist (C06)', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'body');
    assert.throws(
      () => verifyManifest(root, { ...manifest, path: 'artifacts/objects/ab/ghost.txt' }),
      PathEscapeError,
    );
  });
});

test('verifyManifest rejects an escaping path before touching the file (C07)', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'body');
    assert.throws(
      () => verifyManifest(root, { ...manifest, path: '../outside.txt' }),
      SchemaValidationError,
    );
  });
});

test('verifyManifest rejects undeclared truncation', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'body');
    assert.throws(
      () => verifyManifest(root, { ...manifest, original_bytes: manifest.bytes + 500 }),
      (error) => {
        assert.ok(error.violations.some((entry) => entry.invariant === 'truncation_honest'));
        return true;
      },
    );
  });
});

test('verifyManifest accepts declared truncation', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'first 4 bytes of a huge log', {
      kind: 'raw_output',
      truncated: true,
    });
    const result = verifyManifest(root, { ...manifest, original_bytes: 10 * 1024 * 1024 });
    assert.equal(result.manifest.truncated, true);
  });
});

test('the soft limit is reported without rejecting', () => {
  withTask((root) => {
    const body = 'x'.repeat(SOFT_LIMITS.ARTIFACT + 1);
    const manifest = makeManifest(root, body, { kind: 'log' });
    const result = verifyManifest(root, manifest);
    assert.equal(result.softLimitExceeded, true);
  });
});

test('an artifact past the 8 MiB hard limit is refused before it is ever read', () => {
  withTask((root) => {
    // The soft limit above only *reports*. This is the hard limit, and it must reject:
    // without it, `verifyManifest` would hash an arbitrarily large file into memory.
    // The size comes from `statSync`, so the file has to really be that big; the manifest
    // is built by hand because the fixture would hash the whole body just to construct it.
    const body = Buffer.alloc(BUDGETS.ARTIFACT + 1, 0x78);
    assert.equal(body.length, 8 * 1024 * 1024 + 1, 'the design table value, written out');

    const relative = 'artifacts/objects/oversize.bin';
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, body);

    const manifest = {
      ...makeManifest(root, 'placeholder'),
      path: relative,
      bytes: body.length,
      original_bytes: body.length,
      sha256: sha256Bytes(body),
    };

    assert.throws(
      () => verifyManifest(root, manifest),
      (error) => {
        assert.equal(error.code, KERNEL_CODES.BUDGET_EXCEEDED);
        assert.equal(error.details.bytes, body.length);
        assert.equal(error.details.limit, 8 * 1024 * 1024);
        return true;
      },
    );

    // Control: the same manifest is accepted when content verification is what rejects it,
    // proving the throw came from the size gate and not from some unrelated defect.
    assert.equal(verifyManifest(root, manifest, { verifyContent: false }).actualBytes, body.length);
  });
});

test('registerManifest writes the manifest and indexes a pointer only', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'evidence body');
    const { manifestPath } = registerManifest(root, manifest, 7);
    assert.equal(manifestPath, manifestRelativePath(7));
    assert.equal(manifestPath, 'manifests/manifest-7.json');

    const index = readManifestIndex(root);
    assert.deepEqual(index.get('a-fixture01'), {
      artifact_id: 'a-fixture01',
      path: manifest.path,
      sha256: manifest.sha256,
      kind: 'evidence',
      truncated: false,
    });
    // The index row carries no artifact body and no manifest prose.
    assert.equal(Object.keys(index.get('a-fixture01')).length, 5);
  });
});

test('the manifest index accumulates across registrations', () => {
  withTask((root) => {
    registerManifest(root, makeManifest(root, 'first'), 1);
    registerManifest(root, makeManifest(root, 'second', { artifact_id: 'a-fixture02' }), 2);
    const index = readManifestIndex(root);
    assert.deepEqual([...index.keys()].sort(), ['a-fixture01', 'a-fixture02']);
  });
});

test('an empty index reads as an empty map', () => {
  withTask((root) => {
    assert.equal(readManifestIndex(root).size, 0);
  });
});

test('verifyArtifactIntegrity confirms intact evidence during recovery', () => {
  withTask((root) => {
    registerManifest(root, makeManifest(root, 'evidence body'), 1);
    const result = verifyArtifactIntegrity(root);
    assert.deepEqual(result.valid, ['a-fixture01']);
    assert.deepEqual(result.invalid, []);
  });
});

test('verifyArtifactIntegrity flags evidence altered after the fact', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'evidence body');
    registerManifest(root, manifest, 1);

    // Someone edits the artifact after it was cited as evidence.
    writeFileSync(path.join(root, manifest.path), 'tampered content');

    const result = verifyArtifactIntegrity(root);
    assert.deepEqual(result.valid, []);
    assert.equal(result.invalid.length, 1);
    assert.match(result.invalid[0].reason, /digest no longer matches/);
  });
});

test('verifyArtifactIntegrity flags evidence that disappeared', () => {
  withTask((root) => {
    const manifest = makeManifest(root, 'evidence body');
    registerManifest(root, manifest, 1);
    rmSync(path.join(root, manifest.path));

    const result = verifyArtifactIntegrity(root);
    assert.equal(result.invalid.length, 1);
    assert.deepEqual(result.valid, []);
  });
});

test('verifyArtifactIntegrity rejects an index row with an unsafe path', () => {
  withTask((root) => {
    const index = new Map([
      ['a-evil0001', { artifact_id: 'a-evil0001', path: '../outside.txt', sha256: 'a'.repeat(64), kind: 'log' }],
    ]);
    const result = verifyArtifactIntegrity(root, index);
    assert.equal(result.invalid[0].reason, 'unsafe path in index');
  });
});

test('checkManifestShape collects defects without throwing', () => {
  const bad = { schema_version: 1, artifact_id: 'a-001abcd' };
  const result = checkManifestShape(bad);
  assert.equal(result.valid, false);
  assert.ok(result.violations.length > 0);
});

test('the stored digest is the digest of the bytes on disk', () => {
  withTask((root) => {
    const body = 'unicode 目标 body';
    const file = writeArtifactFile(root, body);
    assert.equal(file.sha256, sha256Bytes(Buffer.from(body, 'utf8')));
    // Byte length, not character length.
    assert.equal(file.bytes, Buffer.byteLength(body, 'utf8'));
  });
});
