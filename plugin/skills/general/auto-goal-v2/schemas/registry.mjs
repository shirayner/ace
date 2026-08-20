/**
 * Schema registry: loads the .schema.json documents and inlines their $refs.
 *
 * The validator handles a fixed keyword subset with no reference resolution, so
 * dereferencing happens once here at load time. Schemas stay real JSON files
 * because worker input envelopes reference them by path (design §7.3), while the
 * enum values they contain are pinned to lib/vocabulary.mjs by a kernel test.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMAS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REF_PREFIX = '#/$defs/';

function readSchemaFile(fileName) {
  const filePath = path.join(SCHEMAS_DIR, fileName);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot load schema ${fileName}: ${cause.message}`, { cause });
  }
}

function resolvePointer(documents, ref, fromFile) {
  const [file, pointer] = ref.split('#');
  const sourceFile = file || fromFile;
  const document = documents.get(sourceFile);
  if (!document) {
    throw new Error(`$ref "${ref}" in ${fromFile} points at unknown schema ${sourceFile}`);
  }
  const fullRef = `#${pointer}`;
  if (!fullRef.startsWith(REF_PREFIX)) {
    throw new Error(`$ref "${ref}" in ${fromFile} must target ${REF_PREFIX}<name>`);
  }
  const name = fullRef.slice(REF_PREFIX.length);
  const target = document.$defs?.[name];
  if (!target) {
    throw new Error(`$ref "${ref}" in ${fromFile} targets missing definition "${name}"`);
  }
  return target;
}

/**
 * Recursively replace every `$ref` with a copy of its target.
 *
 * Sibling keywords beside a `$ref` win over the target's — that is how a field
 * declares `nullable: true` on top of a shared fragment.
 */
function dereference(node, documents, fromFile, refStack) {
  if (Array.isArray(node)) {
    return node.map((item) => dereference(item, documents, fromFile, refStack));
  }
  if (node === null || typeof node !== 'object') return node;

  if (typeof node.$ref === 'string') {
    const { $ref, ...siblings } = node;
    if (refStack.includes($ref)) {
      throw new Error(`Circular $ref chain: ${[...refStack, $ref].join(' -> ')}`);
    }
    const target = resolvePointer(documents, $ref, fromFile);
    const [targetFile] = $ref.split('#');
    const resolved = dereference(target, documents, targetFile || fromFile, [...refStack, $ref]);
    return { ...resolved, ...dereference(siblings, documents, fromFile, refStack) };
  }

  const output = {};
  for (const [key, value] of Object.entries(node)) {
    output[key] = dereference(value, documents, fromFile, refStack);
  }
  return output;
}

function loadRegistry() {
  const fileNames = readdirSync(SCHEMAS_DIR).filter((name) => name.endsWith('.schema.json'));
  const documents = new Map(fileNames.map((name) => [name, readSchemaFile(name)]));

  const registry = new Map();
  for (const [fileName, document] of documents) {
    // common.schema.json holds only $defs; it is a fragment source, not a schema.
    if (!document.type) continue;
    const { $defs: _unused, ...schema } = document;
    registry.set(fileName, Object.freeze(dereference(schema, documents, fileName, [])));
  }
  return { registry, documents };
}

const { registry, documents } = loadRegistry();

/** Absolute path of the schemas directory. */
export const schemasDir = SCHEMAS_DIR;

/**
 * Fully dereferenced schema by file name, e.g. `checkpoint.schema.json`.
 * @throws {Error} when the name is unknown — a typo must never pass silently.
 */
export function getSchema(fileName) {
  const schema = registry.get(fileName);
  if (!schema) {
    throw new Error(
      `Unknown schema "${fileName}". Available: ${[...registry.keys()].sort().join(', ')}`,
    );
  }
  return schema;
}

/** Names of all validatable schemas. */
export function listSchemas() {
  return [...registry.keys()].sort();
}

/** Raw, non-dereferenced document — used by the enum-sync test. */
export function getRawSchemaDocument(fileName) {
  const document = documents.get(fileName);
  if (!document) throw new Error(`Unknown schema document "${fileName}"`);
  return document;
}

export const SCHEMA_IDS = Object.freeze({
  GOAL: 'goal.schema.json',
  CRITERION: 'criterion.schema.json',
  JOURNAL_EVENT: 'journal-event.schema.json',
  CHECKPOINT: 'checkpoint.schema.json',
  WORKER_INPUT: 'worker-input.schema.json',
  WORKER_OUTPUT: 'worker-output.schema.json',
  ARTIFACT_MANIFEST: 'artifact-manifest.schema.json',
  INTERRUPTION: 'interruption.schema.json',
});
