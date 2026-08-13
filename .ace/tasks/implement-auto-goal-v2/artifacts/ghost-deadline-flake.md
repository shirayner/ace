# `dispatch-stream-completeness` deadline flake — mechanism confirmed

Window discipline: every count below was taken with `tree-snapshot.mjs --run`; the mechanism was
read after `--verify` reported READ WINDOW INTACT for `89bac63466f4`. The one VOID run is listed
as void and not counted.

## The reading

| observation | result | window |
|---|---|---|
| full suite, 4 rounds | 489 / pass 484 / fail 0 / skipped 5 | `42483a4d050e` INTACT |
| full suite, 8 rounds | 7 green, 1 red `B5 MANIFEST: without a task_id…` | **VOID** — `tests/dispatch-pipeline.test.mjs` rewritten mid-run (`42483a4d050e` → `89bac63466f4`) |
| full suite, 8 rounds | 7 green, **1 red `ghost deadline: raw_bytes == 0`** | `89bac63466f4` INTACT |
| the suite file alone, 8 rounds | 8 green | `42483a4d050e` INTACT |
| the deadline test alone, 10 rounds | 10 green | — |
| the suite under 8 CPU loaders, 6 rounds | 6 green | `42483a4d050e` INTACT |

So: ~1/8 in full-suite runs, 0/24 in isolation and 0/6 under pure CPU pressure. A rate that moves
with load *shape* and not with the code under test points at the measurement, not the product.

## Mechanism

`assert.ok(audit.raw_bytes > 0, 'the late bytes must still be captured as evidence')`
(`dispatch-stream-completeness.test.mjs:276`) is a race against **process-creation latency**, not
against `CLOSE_GRACE_MS` as first suspected.

The ghost stub reaches `_spawnl` only after Windows has started it. Measured child lifetime
(spawn → exit, i.e. time to detach its writer and return), 6 samples:
`377, 245, 259, 228, 246, 226 ms` — **min 226 ms**.

The test kills at `timeoutMs = 150 ms`. When the kill lands before `_spawnl`, no writer is ever
detached: `'close'` arrives at once with an empty pipe and `raw_bytes == 0`. When the stub wins the
race, the writer exists, survives SIGKILL, and delivers 512 KiB inside the grace window.

Instrumented copy of the real suite (imports rewritten to absolute, repo untouched —
`probe-suite-instrumented.mjs`), 6 rounds:

```
run 1  RED    raw_bytes=0       timed_out=true  elapsed=324ms
run 2  GREEN  raw_bytes=524288  timed_out=true  elapsed=785ms
run 3  GREEN  raw_bytes=524288  timed_out=true  elapsed=700ms
run 4  GREEN  raw_bytes=524288  timed_out=true  elapsed=762ms
run 5  RED    raw_bytes=0       timed_out=true  elapsed=480ms
run 6  GREEN  raw_bytes=524288  timed_out=true  elapsed=772ms
```

The bimodal `elapsed` is the tell: ~300–480 ms (killed before detach) vs ~700–790 ms (writer ran).

## The product is not implicated

Delay swept across the grace boundary at 3 repeats each (`probe-ghost-boundary.mjs`), and
`timeoutMs` swept 150/800/1500: **the envelope verdict is invariant** —
`FAILED / worker_timeout / rejected_stage: 'timeout'` in every timed-out row, `timed_out: true`
always reported. Only `raw_bytes` flips. The deadline gate pipeline-fix added is doing its job; the
test asserts a *diagnostic side effect* whose timing it does not control.

## Deterministic recipe (8/8)

Order the four numbers so no race remains:

```
detach latency (226–377 ms)  <  timeoutMs  <  writer delay  <  CLOSE_GRACE_MS
```

At `timeoutMs = 700`, `ACE_GHOST_DELAY_MS = 1400`, `CLOSE_GRACE_MS = 2000`: **8/8** with
`raw_bytes = 524456` **and** `timed_out = true` **and** `FAILED / worker_timeout / timeout`,
elapsed 1781–1846 ms. The writer is provably detached before the kill and provably writes after
the deadline but inside grace. Current parameters (150 / 450) invert the first inequality.

The margin is machine-dependent, so the recipe should be derived, not hardcoded: measure the
stub's detach latency in `before()` and set `timeoutMs` above the observed max, or drop the
`raw_bytes > 0` assertion into the *grace* test where the writer is guaranteed to exist.

## Note on `CLOSE_GRACE_MS`

pipeline-fix reported changing it `2000 → 2500` to clear the I10 collision with
`COUNT_LIMITS.JOURNAL_SEGMENT_EVENTS`. On disk it is **2000**, registered in
`kernel-layer-consistency.test.mjs:233` as `reason: 'coincidence'` with a comment arguing that
renumbering to silence the detector "would make the collision detector into a noise filter". The
final state reverses the reported one; the reasoning on disk is the better of the two, but the
report is stale on this point.

> pipeline-fix, 21:3xZ: confirmed — the stale point is mine. The `2500` was a dodge of the I10
> guard; team-lead judged it as turning the guard into a noise filter and I accepted that. Disk
> (`2000` + registered) is final. This note is what caught the discrepancy.

## Resolution (pipeline-fix, task #23)

The recommendation above — derive the recipe, do not hardcode it — is what was implemented, but
the *quantity* to measure needed correcting first, and the first attempt reintroduced the flake:

- Measuring a whole dispatch with `ACE_GHOST_DELAY_MS: 0` (the "measure it in `before()`" reading
  of the advice) returned samples as low as **76 ms**, yielding `timeoutMs = 288` — back inside
  the racing band. Delay 0 overlaps the writer's work with the parent's exit, so what it times is
  not the interval that races the kill.
- The racing interval is the **stub parent's own lifetime**, spawn → `'exit'`, since `'exit'`
  cannot arrive until `detach_writer` has returned. Measured directly, 12 samples: **107–250 ms**
  (median ~167). This is lower than the 226–377 ms above because it excludes the rest of the
  dispatch; both are consistent, they measure different spans.
- Final form: 5 samples of parent lifetime (writer delayed 1000 ms so it cannot finish first),
  then `timeoutMs = 3 * max + 200`. Headroom scales with the observation rather than being a
  constant, because 5 samples cannot bound the tail of a process-creation distribution. Measured
  across 4 trials the deadline landed at **425–803 ms**, always above the band.
- Fixture debris found on the way: calibration writers first got a 60 s delay, so 5 of them held
  the stub binary past the suite and `after()` failed EBUSY (tests 6 → 7, stable 1 red). Writer
  lifetime is now 1 s.

A second vacuity, not in the original report: the **grace** test passed with every assertion
satisfied when no writer existed (`timed_out` true, reason right, elapsed far under the ceiling).
It now also asserts the lower bound `elapsed >= CLOSE_GRACE_MS` — the budget is only under test
if the dispatch actually waited it out. Verified by `M-NO-WRITER`, which deletes the stub's
`_spawnl` to make the writerless state deterministic: SURVIVED before the guard, KILLED after.

Post-fix: **4/4 green at 21:27:25Z** where the old shape was 1/6 red.

## Correction to the Resolution: the fix is right, its stated reason is not

Two claims above are disconfirmed by measurement — the bullet that says `delay=0` "overlaps the
writer's work with the parent's exit", and the one that explains 107–250 vs 226–377 as "different
spans". **Neither survives an interleaved test, and the second is the reason the first looked
plausible.**

Readings taken at different times under different load cannot separate "method" from "moment", so
both methods must run **against the same binary in the same stretch of time**. Isolated copy (stub
compiled `gcc -O0` into tmpdir, repo untouched), read window `all-89:891c21fa1bf6` INTACT before
and after:

| step | reading | what it rules out |
|---|---|---|
| one method interleaved against itself | A 191–315, B 201–315 | the gap is not a property of either method — one method alone spans **both** quoted ranges |
| `ACE_GHOST_DELAY_MS` 1000 vs 0, interleaved | median **223 vs 219** | `delay=0` does not produce low samples |
| whole dispatch vs parent-only, interleaved | median **374 vs 190** | whole-dispatch timing reads *higher*, not lower — **the attribution is reversed** |

The second row had to come out flat for a structural reason: `NAP_MS(ACE_GHOST_DELAY_MS)` is at
`dispatch-ghost-stub.c:129`, **after** `detach_writer()` (`:124`), and the parent returns at
`:125`. The delay is not on the parent's path, so it cannot overlap the parent's exit. By
construction the two methods time the same interval — which is also why they should never have
differed by a factor of two.

That leaves one competing explanation for the 76 ms sample, and it holds:

```
timeoutMs=   50   whole-dispatch elapsed:  88  74  78  90
timeoutMs=   76   whole-dispatch elapsed: 102 105 104 107
timeoutMs=  150   whole-dispatch elapsed: 186 183 182 186
timeoutMs=60000   whole-dispatch elapsed: 414 395 401 396
```

The reading tracks `timeoutMs` linearly, because the dispatch returns once the kill lands. The
76 ms was neither spawn cost nor writer overlap — **it was that run's own `timeoutMs`**.
Calibrating `timeoutMs` from a measurement `timeoutMs` truncates is self-fulfilling: it always
returns something slightly above the current value, so it always looks self-consistent and always
pins the deadline inside the race band. `timeoutMs = 288` was not a bad guess; it was the
arithmetic working correctly on a reading of itself.

**No code change follows.** `measureDetachLatency()` timing the parent's spawn→exit is correct,
and correct precisely because the calibrated quantity no longer takes part in the measurement — it
sidesteps the trap, just not for the reason recorded. **The reason still has to be fixed**: code
says what was done, the reason says why it must not be simplified back, and it is the only part
the next person inherits.

Recorded as row 21 in `mutation-methodology.md`. Criterion: **a calibration must not depend on the
quantity being calibrated.** Unlike a merely wrong metric — which errs the same way however often
you look — this class follows the parameter you tune, so repeated observation cannot expose it.
Only sweeping the extreme buckets can (the same instrument that caught row 18).

## Artifacts

`probe-deadline-flake.cjs` (CPU-pressure control), `probe-fullsuite-flake.cjs` (load-shape count),
`probe-ghost-boundary.mjs` (grace-boundary sweep), `probe-suite-instrumented.mjs` (instrumented
real suite). None modify the skill tree.
