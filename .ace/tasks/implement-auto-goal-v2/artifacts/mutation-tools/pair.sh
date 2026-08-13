#!/usr/bin/env bash
# Paired mutation verification, robust to a concurrently-edited source tree.
#
# Why paired: the repo is being edited by other agents right now, so a raw
# "fail > 0" reading cannot distinguish "my mutation broke it" from "the tree
# was mid-write". Both halves here come from ONE snapshot, and a kill is
# attributed only by the SET DIFFERENCE of failing test names. This is the
# control-group rule applied to the verification tool itself.
#
# Usage: pair.sh <id> <relFile> <oldText> <newText>
set -u
ROOT=/tmp/agv2-rc2
SRC="D:/Users/r.shi/work-space/incubator-mess/requirement-agent-skill/ace/plugin/skills/auto-goal-v2"
ID="$1"; REL="$2"; OLD="$3"; NEW="$4"

SNAP="$ROOT/snap-$ID"; MUT="$ROOT/mut-$ID"
rm -rf "$SNAP" "$MUT" 2>/dev/null
cp -r "$SRC" "$SNAP" || { echo "$ID COPY-FAILED"; exit 1; }
cp -r "$SNAP" "$MUT" || { echo "$ID COPY2-FAILED"; exit 1; }

printf '%s' "$OLD" > "$ROOT/po-$ID.txt"
printf '%s' "$NEW" > "$ROOT/pn-$ID.txt"
node "$ROOT/mutate.mjs" "$MUT" "$REL" "$ROOT/po-$ID.txt" "$ROOT/pn-$ID.txt" 2>"$ROOT/pp-$ID.log"
case $? in
  9) echo "$ID TARGET-MISSING (site changed)"; exit 0 ;;
  8) echo "$ID VOID-MUTATION"; exit 0 ;;
  0) ;;
  *) echo "$ID PATCH-ERROR"; exit 0 ;;
esac

fails() { # print sorted failing test names for a tree
  cd "$1" || return 1
  node --test tests/*.test.mjs 2>&1 \
    | sed -n 's/^not ok [0-9]* - //p;s/^✖ \(.*\) ([0-9.]*ms)$/\1/p' \
    | sed 's/ ([0-9.]*ms)$//' | sort -u
}

fails "$SNAP" > "$ROOT/fc-$ID.txt"
fails "$MUT"  > "$ROOT/fm-$ID.txt"

NEWFAILS=$(comm -13 "$ROOT/fc-$ID.txt" "$ROOT/fm-$ID.txt")
CTRLFAILS=$(wc -l < "$ROOT/fc-$ID.txt" | tr -d ' ')
if [ -n "$NEWFAILS" ]; then
  echo "$ID KILLED (control had $CTRLFAILS pre-existing fails) by:"
  printf '%s\n' "$NEWFAILS" | sed 's/^/    - /'
else
  echo "$ID SURVIVED (control had $CTRLFAILS pre-existing fails; mutant added none)"
fi
