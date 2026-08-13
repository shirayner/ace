/**
 * Measure the three counterexamples [A]/[C]/[D] against ALL THREE input gates.
 *
 * The ledger claims each construction has exactly one gate objecting and the other two
 * passing. `dispatchWorker` cannot show that: it short-circuits at the first gate that
 * objects, so "the other two would have passed" is never observable through it. So call the
 * three gates directly, the same way the product calls them, and print the full 3x3.
 *
 * If any row has more than one REJECT, the ledger's independence claim is wrong for that row.
 */
import { BUDGETS } from '../../../../plugin/skills/auto-goal-v2/lib/budgets.mjs';
import { validateSchema } from '../../../../plugin/skills/auto-goal-v2/lib/schema-validator.mjs';
import { getSchema, SCHEMA_IDS } from '../../../../plugin/skills/auto-goal-v2/schemas/registry.mjs';
import { buildWorkerInput, measureWorkerInput, WORKER_SYSTEM_PROMPT } from '../../../../plugin/skills/auto-goal-v2/scripts/dispatch-worker.mjs';
import { checkLaunchBudget, injectedBytes } from '../../../../plugin/skills/auto-goal-v2/scripts/ingest-audit.mjs';

const constructions = {
  'A: every field legal, assembled total over 2 KiB': {
    dispatchId: 'd-env-indep',
    taskId: 'goal-dispatch-pipeline',
    role: 'DISCOVER',
    objective: 'y'.repeat(400),
    constraints: Array.from({ length: 16 }, (_, i) => `${i}:${'c'.repeat(120)}`),
    scope: {
      include: Array.from({ length: 16 }, (_, i) => `${i}:${'i'.repeat(100)}`),
      exclude: Array.from({ length: 16 }, (_, i) => `${i}:${'e'.repeat(100)}`),
    },
  },
  'C: objective 401 B (field cap + 1)': {
    dispatchId: 'd-env-indep',
    taskId: 'goal-dispatch-pipeline',
    role: 'DISCOVER',
    objective: 'x'.repeat(401),
  },
  'D: role ADMIN, semantic not volumetric': {
    dispatchId: 'd-env-indep',
    taskId: 'goal-dispatch-pipeline',
    role: 'ADMIN',
    objective: 'x',
  },
};

for (const [label, args] of Object.entries(constructions)) {
  const envelope = buildWorkerInput(args);
  const { serialized, bytes } = measureWorkerInput(envelope);

  const breakdown = injectedBytes({ systemPrompt: WORKER_SYSTEM_PROMPT, userPrompt: serialized, jsonSchema: '' });
  const launch = checkLaunchBudget(breakdown);
  const shape = validateSchema(envelope, getSchema(SCHEMA_IDS.WORKER_INPUT));
  const envGate = bytes <= BUDGETS.WORKER_INPUT_ENVELOPE;

  const verdict = (ok) => (ok ? 'PASS  ' : 'REJECT');
  const rejects = [launch.ok, shape.valid, envGate].filter((ok) => !ok).length;

  console.log(`\n${label}`);
  console.log(`  16 KiB launch total : ${verdict(launch.ok)}  ${breakdown.total} B (headroom ${16 * 1024 - breakdown.total})`);
  console.log(`  schema              : ${verdict(shape.valid)}  ${shape.valid ? '' : JSON.stringify(shape.violations)}`);
  console.log(`  2 KiB envelope      : ${verdict(envGate)}  ${bytes} B / ${BUDGETS.WORKER_INPUT_ENVELOPE}`);
  console.log(`  --> ${rejects} gate(s) objecting${rejects === 1 ? '' : '   <-- LEDGER CLAIM BROKEN for this row'}`);
}
