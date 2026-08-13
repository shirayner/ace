#!/usr/bin/env bash
# Pre-flight admissibility check for a mutation-verification round.
#
# Answers ONE question: is this snapshot safe to attribute mutation results to?
# Four independent detectors, because no single one caught all three of the
# half-written snapshots this task actually stumbled into:
#
#   stumble 1 (kernel-recovery red)   -> caught by CONTROL
#   stumble 2 (transient 2 fails)     -> caught by CONTROL
#   stumble 3 (M24, argv-echo-stub.c) -> CONTROL was clean (fail 0);
#                                        caught only by QUIESCENCE + ORPHAN
#
# Usage: preflight.sh <srcDir> [quietSeconds]
# Exit 0 = admissible, 1 = inadmissible (discard the round, do not attribute).
set -u
SRC="$1"
QUIET="${2:-180}"
VERDICT=0

echo "=== mutation round pre-flight: $SRC ==="

# --- D1 QUIESCENCE: has anyone edited the tree in the last <QUIET> seconds? ---
# Rationale: catches "the fixer just changed the target" — the one failure mode
# paired judgment CANNOT see, because a half-landed fix leaves the suite green.
#
# MUST run against the LIVE source tree, never a copy: plain `cp -r` rewrites
# every mtime to copy time, which would silently turn this detector into a
# tautology reporting "everything was just edited". Verified: cp -r resets,
# cp -a/-p preserves. Guard below refuses an obviously copy-flattened tree.
NOW=$(date +%s)
NEWEST=0; NEWEST_F=""
while IFS= read -r f; do
  M=$(stat -c %Y "$f" 2>/dev/null) || continue
  [ "$M" -gt "$NEWEST" ] && { NEWEST=$M; NEWEST_F="$f"; }
done < <(find "$SRC/lib" "$SRC/scripts" "$SRC/protocols" "$SRC/tests" \
           -type f \( -name '*.mjs' -o -name '*.c' -o -name '*.json' -o -name '*.md' \) 2>/dev/null)
AGE=$((NOW - NEWEST))
# A negative age means the newest mtime is in the future relative to `date`
# (filesystem/clock skew, or a write landing during this very scan). Either way
# it is the strongest possible "someone is editing right now" signal, so clamp
# to 0 rather than letting the comparison read it as "old enough".
[ "$AGE" -lt 0 ] && AGE=0

# Copy-flattened tree detector: if EVERY scanned file shares one mtime to the
# second, these are copy timestamps, not edit timestamps, and D1 is meaningless.
DISTINCT=$(find "$SRC/lib" "$SRC/scripts" "$SRC/protocols" "$SRC/tests" -type f \
             \( -name '*.mjs' -o -name '*.c' \) -printf '%T@\n' 2>/dev/null \
           | cut -d. -f1 | sort -u | wc -l)
if [ "$DISTINCT" -le 1 ]; then
  echo "D1 QUIESCENCE  FAIL  all mtimes identical -> copy-flattened tree; point D1 at the live source"
  VERDICT=1
elif [ "$AGE" -lt "$QUIET" ]; then
  echo "D1 QUIESCENCE  FAIL  newest edit ${AGE}s ago (<${QUIET}s): ${NEWEST_F#$SRC/}"
  VERDICT=1
else
  echo "D1 QUIESCENCE  ok    newest edit ${AGE}s ago: ${NEWEST_F#$SRC/}"
fi

# --- D2 CONTROL: does the UNMUTATED snapshot pass? ---
# Rationale: any pre-existing red makes "fail > 0" meaningless as a kill signal.
WORK=$(mktemp -d)/snap
cp -r "$SRC" "$WORK" 2>/dev/null || { echo "D2 CONTROL     FAIL  copy failed"; exit 1; }
CTRL=$(cd "$WORK" && node --test tests/*.test.mjs 2>&1 | grep -E '^. (tests|pass|fail) ' | tr '\n' ' ')
CF=$(printf '%s' "$CTRL" | sed -n 's/.*fail \([0-9]*\).*/\1/p')
if [ "${CF:-1}" -ne 0 ]; then
  echo "D2 CONTROL     FAIL  unmutated snapshot is not green: $CTRL"
  VERDICT=1
else
  echo "D2 CONTROL     ok    $CTRL"
fi

# --- D3 ORPHAN: fixtures/helpers with no referrer = work landed half-way. ---
# Rationale: this is what exposed M24. A fixture built for an integration test
# that is not yet written means the gap is being closed RIGHT NOW.
ORPH=0
for f in "$SRC"/tests/fixtures/*; do
  [ -e "$f" ] || continue
  b=$(basename "$f")
  n=$(grep -rl -- "$b" "$SRC/tests" "$SRC/lib" "$SRC/scripts" 2>/dev/null | grep -cv "fixtures/$b$")
  if [ "$n" -eq 0 ]; then echo "D3 ORPHAN      WARN  no referrer: tests/fixtures/$b"; ORPH=1; fi
done
[ "$ORPH" -eq 0 ] && echo "D3 ORPHAN      ok    every fixture has a referrer" || VERDICT=1

# --- D4 GIT: uncommitted churn in the tree under test ---
DIRTY=$(cd "$SRC" && git status --porcelain . 2>/dev/null | wc -l)
echo "D4 GIT         info  $DIRTY dirty path(s) (expected while work is in flight)"

echo "=== verdict: $([ $VERDICT -eq 0 ] && echo ADMISSIBLE || echo INADMISSIBLE) ==="
exit $VERDICT
