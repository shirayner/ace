/**
 * Contract-table extraction (protocols/runtime-contract.md ↔ implementation exports).
 *
 * The table is the main agent's only sanctioned call surface: it exists so the
 * agent can invoke a runtime module without first reading its source. That
 * saves the bulk of a run's context, but only while the table stays true — a
 * stale entry makes the documented call fail, and the agent falls back to
 * reading the implementation, which is exactly the cost the table removes.
 *
 * So the table is validated against the source rather than trusted. Parsing
 * returning nothing counts as failure, not as a pass.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The contract lives outside SKILL.md to keep SKILL.md within BUDGETS.SKILL_MD. */
export const CONTRACT_FILE = path.join('protocols', 'runtime-contract.md');

const CONTRACT_HEADING = '## 契约表';
const TABLE_ROW = /^\| `/;
const EXPORT_NAME = /`([A-Za-z_][A-Za-z0-9_]*)/g;
const EXPORTED_DECLARATION = [
  /^export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
  /^export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
];

/** Rows of the contract table, as `{ module, exports }`. Throws if the section is gone. */
export function parseContractTable(contractMarkdown) {
  const sectionStart = contractMarkdown.indexOf(CONTRACT_HEADING);
  if (sectionStart === -1) throw new Error(`${CONTRACT_FILE} is missing the 契约表 section`);

  const rows = contractMarkdown
    .slice(sectionStart)
    .split('\n')
    .filter((line) => TABLE_ROW.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 4 && !cells[1].startsWith('---'))
    .map(([, moduleCell, exportsCell]) => ({
      module: moduleCell.replace(/`/g, ''),
      exports: [...exportsCell.matchAll(EXPORT_NAME)].map((match) => match[1]),
    }));

  if (rows.length === 0) throw new Error('Contract table parsed to zero rows — parser failure, not a pass');
  return rows;
}

/** Names the module actually exports, read from source. */
export function exportedNames(source) {
  const names = new Set();
  for (const pattern of EXPORTED_DECLARATION) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  return names;
}

/** Human-readable mismatches; empty array means the table is accurate. */
export function contractMismatches(skillRoot) {
  const rows = parseContractTable(readFileSync(path.join(skillRoot, CONTRACT_FILE), 'utf8'));
  const mismatches = [];

  for (const { module, exports: claimed } of rows) {
    if (claimed.length === 0) {
      mismatches.push(`${module}: row declares no exports (parse anomaly)`);
      continue;
    }
    const actual = exportedNames(readFileSync(path.join(skillRoot, module), 'utf8'));
    const missing = claimed.filter((name) => !actual.has(name));
    if (missing.length > 0) {
      mismatches.push(`${module}: declared in table but not exported → ${missing.join(', ')}`);
    }
  }
  return mismatches;
}
