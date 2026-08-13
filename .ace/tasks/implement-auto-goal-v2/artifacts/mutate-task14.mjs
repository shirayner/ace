#!/usr/bin/env node
/**
 * Bidirectional mutation verification for the two dispatch gates named in task #14.
 *
 * Each gate gets two mutations, because one direction alone cannot distinguish a real
 * assertion from a rejection-only test suite:
 *
 *   OPEN  — the gate never fires. Kills prove some test reaches the gate and requires it
 *           to reject; a survivor means the gate is decorative.
 *   SHUT  — the gate always fires. Kills prove some test requires the gate NOT to reject
 *           a good input. A survivor means every assertion about this gate is of the form
 *           "it said no", which an unconditionally-rejecting dispatcher also satisfies.
 *
 * SHUT is scored on the CONTROL cases specifically, not on "some test went red": if the
 * only new failures are the gate's own rejection tests asserting a different `reason`, the
 * suite still has no positive case and SHUT must be reported as unprotected.
 *
 * Self-check is by CONTENT HASH, never file size. `> 0` -> `false` is length-changing here,
 * but the general class is not, and a size-only fingerprint is blind to exactly the mutation
 * most worth running (docs-wiring hit this). A hash that does not move means the edit did not
 * land, which is indistinguishable in the test output from "the constraint held" -> VOID.
 *
 * Usage: node mutate-task14.mjs <id|all>
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SKILL = path.resolve(
  import.meta.dirname, '..', '..', '..', '..', 'plugin', 'skills', 'auto-goal-v2',
);

const WORKER = 'scripts/dispatch-worker.mjs';
const VALIDATOR = 'lib/semantic-validator.mjs';

/** The manifest-stage rejection, verbatim from `dispatch-worker.mjs`. */
const MANIFEST_GATE = `      audit.rejected_stage = 'manifest';
      audit.violations = [{ invariant: 'manifest_registers', message: String(error.message) }];
      return {
        envelope: rejection({
          dispatchId,
          code: 'RESULT_REJECTED',
          reason: 'manifest_registration_failed',
          artifactPointer: relPath,
        }),
        audit,
      };`;

/**
 * Tests whose failure counts as evidence for a SHUT mutation.
 *
 * A control is a case that asserts a GOOD input is accepted. Only these can catch a gate
 * that rejects everything; the rejection tests would keep passing (or fail for an unrelated
 * reason such as a changed `reason` string) and prove nothing about the positive direction.
 */
const CONTROLS = {
  semantic: [
    'B5 control: a well-formed, in-authority result is accepted end to end',
    'B5 MANIFEST control: the same reply registers and succeeds when nothing is in the way',
  ],
  manifest: [
    'B5 MANIFEST control: the same reply registers and succeeds when nothing is in the way',
    'B5 control: a well-formed, in-authority result is accepted end to end',
  ],
  // An input gate fires before the spawn, so an always-rejecting one takes down every
  // end-to-end case at once. The control that MATTERS is the one asserting what the worker
  // actually received: a suite could notice "nothing runs any more" while still having no
  // case that pins the envelope's contents, and those are different degrees of protection.
  input: [
    '§2: the worker receives the envelope, not a bare objective',
    'B5 control: a well-formed, in-authority result is accepted end to end',
  ],
};

const MUTATIONS = {
  // ---- Gate A: the SEMANTIC VALIDATE branch at dispatch-worker.mjs:702 ----
  A_OPEN: {
    gate: 'semantic',
    direction: 'OPEN',
    note: 'semantic violations are computed and then ignored; every schema-valid reply is accepted',
    edits: [[WORKER, 'if (violations.length > 0) {', 'if (false) {']],
  },
  A_SHUT: {
    gate: 'semantic',
    direction: 'SHUT',
    note: 'every schema-valid reply is rejected as semantically invalid',
    edits: [[WORKER, 'if (violations.length > 0) {', 'if (true) {']],
  },

  // ---- Gate B: the MANIFEST registration branch at dispatch-worker.mjs:549 ----
  B_OPEN: {
    gate: 'manifest',
    direction: 'OPEN',
    note: 'a registration failure is swallowed; the dispatch proceeds with no manifest',
    edits: [[WORKER, MANIFEST_GATE, '      void error; // MUTATION: failure swallowed']],
  },
  B_SHUT: {
    gate: 'manifest',
    direction: 'SHUT',
    // Reaching an always-firing manifest gate means forcing the throw it catches. Editing the
    // gate's own condition is impossible -- it is a `catch`, not an `if` -- so the equivalent
    // SHUT is "registration always fails", which is what the gate reacts to.
    note: 'registration always throws, so every attributable dispatch rejects at the manifest stage',
    edits: [[
      WORKER,
      '      const registered = registerManifest(resolve(taskRoot), manifest, dispatchId);',
      `      if (true) throw new Error('MUTATION: forced registration failure');
      const registered = registerManifest(resolve(taskRoot), manifest, dispatchId);`,
    ]],
  },

  // ---- Item C: one deletion per newly-covered invariant in `validateWorkerOutput` ----
  //
  // Deleting the check (rather than flipping a condition) is the mutation that matches the
  // claim being made: "this invariant is now reachable end-to-end". If deleting it leaves
  // the suite green, the new test does not reach it and the coverage claim is false.
  //
  // No SHUT twin per invariant: `A_SHUT` already forces the whole semantic gate to reject
  // everything and dies on two positive cases, so the positive direction is covered once for
  // the gate as a whole. A per-invariant SHUT would only restate that.
  C_claim_evidence_exists: {
    gate: 'semantic', direction: 'OPEN',
    note: 'an evidence_ref naming no registered artifact is accepted',
    edits: [[VALIDATOR, `      } else if (!artifactIndex.has(claim.evidence_ref)) {
        violations.push(
          violation(
            'claim_evidence_exists',
            \`claim evidence_ref \${claim.evidence_ref} is not a registered artifact of this task\`,
          ),
        );
      }`, '      }']],
  },
  C_claim_rung: {
    gate: 'semantic', direction: 'OPEN',
    note: 'a criterion_checked claim may omit achieved_rung',
    edits: [[VALIDATOR, `    if (claim.kind === 'criterion_checked' && !claim.achieved_rung) {`, '    if (false) {']],
  },
  C_artifact_resolves: {
    gate: 'semantic', direction: 'OPEN',
    note: 'artifact_refs are no longer checked against the index',
    edits: [[VALIDATOR, `  for (const artifactId of output.artifact_refs ?? []) {
    if (!artifactIndex.has(artifactId)) {`, `  for (const artifactId of output.artifact_refs ?? []) {
    if (false) {`]],
  },
  C_error_present: {
    gate: 'semantic', direction: 'OPEN',
    note: 'FAILED without an error object is accepted',
    edits: [[VALIDATOR, `  if (output.status === 'FAILED' && !output.error) {`, '  if (false) {']],
  },
  C_error_absent: {
    gate: 'semantic', direction: 'OPEN',
    note: 'SUCCEEDED carrying an error object is accepted',
    edits: [[VALIDATOR, `  if (output.status === 'SUCCEEDED' && output.error) {`, '  if (false) {']],
  },

  // ---- Item C, second half: the two invariants the inventory found unnamed in tests/ ----
  //
  // These are NOT reachable through `dispatchWorker` (see the report), so their mutations
  // are scored against the suite as a whole rather than against the pipeline tests.
  //
  // The RENAME mutations are the sharper instrument here: a test that asserts only
  // `violations.length === 1` passes no matter WHICH invariant fired, so it cannot tell a
  // correct rejection from a rejection for the wrong reason. Deleting the check would kill
  // such a test; renaming it would not. Both are run, and the difference is the finding.
  C_bytes_match_DELETE: {
    gate: 'manifest-semantics', direction: 'OPEN',
    note: 'a manifest may misreport its byte count',
    edits: [[VALIDATOR, `  if (actualBytes !== undefined && actualBytes !== manifest.bytes) {
    violations.push(
      violation('bytes_match', \`manifest bytes \${manifest.bytes} != stored \${actualBytes}\`),
    );
  }

`, '']],
  },
  C_bytes_match_RENAME: {
    gate: 'manifest-semantics', direction: 'RENAME',
    note: 'the wrong byte count is still refused, but reported as a digest mismatch',
    edits: [[VALIDATOR, `      violation('bytes_match', \`manifest bytes`, `      violation('digest_matches', \`manifest bytes`]],
  },
  C_phase_transition_DELETE: {
    gate: 'phase', direction: 'OPEN',
    note: 'any transition between two known phases is permitted',
    edits: [[VALIDATOR, '  if (!allowed.includes(toPhase)) {', '  if (false) {']],
  },
  C_phase_transition_RENAME: {
    gate: 'phase', direction: 'RENAME',
    note: 'the illegal transition is still refused, but under the wrong invariant name',
    edits: [[VALIDATOR, `        'phase_transition',`, `        'phase_known',`]],
  },

  // ---- Task #16: the three INPUT-envelope gates, all of which fire before any spawn ----
  //
  // Task #16 was filed as "the protocol-declared object is never constructed": the audit found
  // `SCHEMA_IDS.WORKER_INPUT` with zero production `getSchema()` calls and `stdin.write(objective)`
  // passing a bare string. On the tree measured here the object exists and all three gates are
  // wired. That is exactly the claim that must not be accepted on a reading of the source: the
  // family's disease is a gate that is present, called, and green while pinning nothing. So each
  // gate gets the same bidirectional treatment.
  //
  // The SHUT control differs from the semantic gates': an input gate fires BEFORE the spawn, so
  // an always-rejecting one kills every end-to-end case, not just the two semantic controls. The
  // positive-direction evidence therefore has to be a case that observes what reached the worker.
  D_input_schema_OPEN: {
    gate: 'input', direction: 'OPEN',
    note: 'the envelope is schema-checked and the verdict discarded; a 1900-byte objective reaches the worker despite the 400-byte cap',
    edits: [[WORKER, '  if (!inputShape.valid) {', '  if (false) {']],
  },
  D_input_schema_SHUT: {
    gate: 'input', direction: 'SHUT',
    note: 'every dispatch is refused as input_schema_invalid, so no worker ever starts',
    edits: [[WORKER, '  if (!inputShape.valid) {', '  if (true) {']],
  },
  D_input_budget_OPEN: {
    gate: 'input', direction: 'OPEN',
    note: 'the 2 KiB envelope ceiling is measured and ignored',
    edits: [[WORKER, '  if (input.bytes > BUDGETS.WORKER_INPUT_ENVELOPE) {', '  if (false) {']],
  },
  D_input_budget_SHUT: {
    gate: 'input', direction: 'SHUT',
    note: 'every envelope is over budget, so no worker ever starts',
    edits: [[WORKER, '  if (input.bytes > BUDGETS.WORKER_INPUT_ENVELOPE) {', '  if (true) {']],
  },

  // The regression itself, not a gate: send the bare objective the audit described. Both gates
  // stay in place and keep passing their own tests -- the envelope is still built, validated and
  // measured, only what reaches stdin changes. A suite that stays green here has gates that
  // guard an object nobody delivers, which is the precise defect #16 names, and no amount of
  // gate-flipping would find it. This is the mutation that proves the object is the payload.
  D_bare_objective: {
    gate: 'input', direction: 'BYPASS',
    note: 'gates intact, but stdin receives the bare objective again -- the exact pre-fix regression',
    edits: [[WORKER, '    child.stdin.write(input.serialized);', '    child.stdin.write(objective);']],
  },

  // The builder's fields, one rename each. A test that only checks the envelope parses and
  // validates cannot tell `role` from `task_id`; the worker is judged against the role it was
  // told, so a silently-dropped field is a semantic defect the schema permits (both are
  // nullable, so an omission is VALID input -- there is no shape error to catch it).
  D_role_dropped: {
    gate: 'input', direction: 'FIELD',
    note: 'the envelope omits `role`; schema-legal (nullable) but the worker is never told what it is judged against',
    edits: [[WORKER, `    task_id: taskId,
    role,`, `    task_id: taskId,
    role: null,`]],
  },
  D_write_root_wrong: {
    gate: 'input', direction: 'FIELD',
    note: 'write_root names another dispatch\'s slot; still a schema-legal relative path',
    edits: [[WORKER, '    write_root: `work/${dispatchId}/`,', "    write_root: 'work/other/',"]],
  },

  // Control: no mutation. Establishes that the copy itself is green, so any red below is
  // attributable to the edit rather than to the copy or the environment.
  NONE: { gate: '-', direction: 'NONE', note: 'unmutated copy', edits: [] },
};
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

/** Apply one mutation into a fresh copy. Returns the copy root, or exits on VOID. */
function materialize(id, mutation) {
  const work = mkdtempSync(path.join(tmpdir(), `agv2-t14-${id}-`));
  const root = path.join(work, 'auto-goal-v2');
  cpSync(SKILL, root, { recursive: true });

  for (const [relative, from, to] of mutation.edits) {
    const file = path.join(root, relative);
    const before = readFileSync(file, 'utf8');
    if (!before.includes(from)) {
      console.error(`[${id}] VOID: target absent in ${relative}\n--- looked for ---\n${from}`);
      process.exit(3);
    }
    if (before.split(from).length - 1 !== 1) {
      console.error(`[${id}] VOID: target occurs ${before.split(from).length - 1}x in ${relative}; the edit would be ambiguous`);
      process.exit(3);
    }
    writeFileSync(file, before.split(from).join(to));
    const after = readFileSync(file, 'utf8');
    if (sha(after) === sha(before)) {
      console.error(`[${id}] VOID: content hash unchanged in ${relative} (${sha(before)})`);
      process.exit(3);
    }
    console.log(`[${id}] ${relative}: ${sha(before)} -> ${sha(after)} (${before.length} -> ${after.length} bytes)`);
  }
  if (id !== 'NONE' && mutation.edits.length === 0) {
    console.error(`[${id}] VOID: mutation declared no edits`);
    process.exit(3);
  }
  return { work, root };
}

/** Run the whole suite in `root`; return counts plus the set of failing test names. */
function runSuite(root) {
  const files = readdirSync(path.join(root, 'tests'))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `tests/${name}`);
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ACE_REQUIRE_STUB_BACKEND: '1' },
  });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const counts = /# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/.exec(out);
  if (!counts) {
    console.error(`VOID: unparseable test output\n${out.slice(-4000)}`);
    process.exit(4);
  }
  return {
    tests: Number(counts[1]),
    pass: Number(counts[2]),
    fail: Number(counts[3]),
    failing: new Set([...out.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1].trim())),
  };
}

function report(id, mutation) {
  const { work, root } = materialize(id, mutation);
  try {
    // Paired: the control half comes from the SAME copy operation, so a pre-existing red
    // (or a flake) is subtracted rather than being mistaken for a kill.
    const { root: baseRoot, work: baseWork } = materialize('NONE', MUTATIONS.NONE);
    let base;
    try {
      base = runSuite(baseRoot);
    } finally {
      rmSync(baseWork, { recursive: true, force: true });
    }
    const mutant = runSuite(root);
    const added = [...mutant.failing].filter((name) => !base.failing.has(name)).sort();

    console.log(`[${id}] gate=${mutation.gate} direction=${mutation.direction}`);
    console.log(`[${id}] ${mutation.note}`);
    console.log(`[${id}] control: tests=${base.tests} fail=${base.fail}`);
    console.log(`[${id}] mutant:  tests=${mutant.tests} fail=${mutant.fail}`);
    console.log(`[${id}] newly failing: ${added.length}`);
    for (const name of added) console.log(`    FAIL: ${name}`);

    if (added.length === 0) {
      console.log(`[${id}] VERDICT: SURVIVED -- no test requires this gate in this direction`);
      return;
    }
    if (mutation.direction === 'SHUT') {
      const hit = CONTROLS[mutation.gate].filter((name) => added.includes(name));
      console.log(`[${id}] control cases among the new failures: ${hit.length ? hit.join('; ') : 'NONE'}`);
      console.log(`[${id}] VERDICT: ${hit.length ? 'KILLED (by a positive case)' : 'SURVIVED-IN-EFFECT (only rejection tests moved; no positive case exists)'}`);
      return;
    }
    console.log(`[${id}] VERDICT: KILLED`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const requested = process.argv[2];
const ids = requested === 'all' || requested === undefined
  ? [
      'NONE', 'A_OPEN', 'A_SHUT', 'B_OPEN', 'B_SHUT',
      'C_claim_evidence_exists', 'C_claim_rung', 'C_artifact_resolves',
      'C_error_present', 'C_error_absent',
    ]
  : [requested];
for (const id of ids) {
  const mutation = MUTATIONS[id];
  if (!mutation) {
    console.error(`unknown mutation ${id}; known: ${Object.keys(MUTATIONS).join(', ')}`);
    process.exit(2);
  }
  if (id === 'NONE') {
    const { work, root } = materialize('NONE', mutation);
    try {
      const base = runSuite(root);
      console.log(`[NONE] control copy: tests=${base.tests} pass=${base.pass} fail=${base.fail}`);
      for (const name of base.failing) console.log(`    FAIL: ${name}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
    continue;
  }
  report(id, mutation);
  console.log('');
}
