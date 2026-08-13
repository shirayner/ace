/*
 * Stub clean-context backend for offline C05 regression.
 *
 * Why a compiled native binary instead of a Node script: `dispatchWorker` always
 * spawns the backend with the fixed Claude-CLI argv from `buildArgs()` and with
 * `shell: false`. `node.exe` rejects that argv outright ("bad option: --bare",
 * exit 9) because the flags precede any script path, and a `.cmd`/`.bat` shim
 * cannot be spawned without a shell (the EINVAL constraint `backend-resolve.mjs`
 * exists to document). A native executable that simply ignores argv is therefore
 * the only stand-in that exercises the real spawn path without a test backdoor
 * in the product code.
 *
 * Contract: drain stdin (the objective), then write one canned reply to stdout
 * chosen by ACE_STUB_MODE. Exit 0 always -- a rejection must come from the
 * dispatcher's parsing rules, never from a non-zero exit code.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* A well-formed CLI envelope whose `result` is well-formed worker JSON. */
static const char *OK_REPLY =
    "{\"result\":\"{\\\"status\\\":\\\"SUCCEEDED\\\",\\\"summary\\\":\\\"stub ok\\\"}\","
    "\"usage\":{\"input_tokens\":10,\"cache_read_input_tokens\":0}}";

/* Valid CLI envelope, but the worker's own reply claims a status off the enum. */
static const char *BAD_STATUS_REPLY =
    "{\"result\":\"{\\\"status\\\":\\\"MAYBE\\\",\\\"summary\\\":\\\"plausible but invalid\\\"}\"}";

int main(void) {
  char buf[8192];
  /* Drain stdin first: exiting early would hand the parent an EPIPE instead of
     the reply we are here to test. */
  while (fread(buf, 1, sizeof buf, stdin) > 0) {
    /* discard */
  }

  const char *mode = getenv("ACE_STUB_MODE");
  if (mode == NULL) mode = "ok";

  if (strcmp(mode, "plain") == 0) {
    fputs("BANANA", stdout);
  } else if (strcmp(mode, "truncated") == 0) {
    fputs("{\"status\":\"SUCC", stdout);
  } else if (strcmp(mode, "schema") == 0) {
    fputs("{\"foo\":1}", stdout);
  } else if (strcmp(mode, "empty") == 0) {
    /* nothing at all on stdout */
  } else if (strcmp(mode, "huge") == 0) {
    /* Far beyond the 1 KiB envelope budget, and not JSON at any prefix. */
    memset(buf, 'X', sizeof buf);
    for (int i = 0; i < 32; i++) fwrite(buf, 1, sizeof buf, stdout);
  } else if (strcmp(mode, "badstatus") == 0) {
    fputs(BAD_STATUS_REPLY, stdout);
  } else {
    fputs(OK_REPLY, stdout);
  }

  fflush(stdout);
  return 0;
}
