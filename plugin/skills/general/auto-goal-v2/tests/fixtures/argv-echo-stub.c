/*
 * Stub clean-context backend that reports the argv it actually received.
 *
 * Exists for one assertion the other stubs cannot make: that `dispatchWorker` spawns
 * with `shell: false`. `shell: true` is not observable from the dispatcher's own
 * return value — it is observable only from inside the child, because a shell
 * re-splits the joined command line and the argument boundaries the parent built are
 * lost. So the child has to tell us what it got.
 *
 * Contract: drain stdin (the objective), then emit a CLI-shaped envelope whose
 * `result` is a well-formed worker reply. The received argv is reported in
 * `argv_echo`, a sibling of `result` inside the outer CLI envelope, so the reply
 * still passes the dispatcher's worker-output contract and the accept/reject
 * distinction stays meaningful (a control case must be able to succeed).
 *
 * Exit 0 always: a rejection must come from the dispatcher's rules, never from a
 * non-zero exit code.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

/* JSON-escape one argv element onto stdout. Argv here is ASCII by construction. */
static void put_json_string(const char *text) {
  putchar('"');
  for (const char *p = text; *p != '\0'; p++) {
    unsigned char c = (unsigned char)*p;
    if (c == '"' || c == '\\') {
      putchar('\\');
      putchar(c);
    } else if (c == '\n') {
      fputs("\\n", stdout);
    } else if (c == '\r') {
      fputs("\\r", stdout);
    } else if (c == '\t') {
      fputs("\\t", stdout);
    } else if (c < 0x20) {
      printf("\\u%04x", c);
    } else {
      putchar(c);
    }
  }
  putchar('"');
}

int main(int argc, char **argv) {
#ifdef _WIN32
  /* Text mode would rewrite \n and change the byte counts the parent hashes. */
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif

  char buf[8192];
  /* Drain stdin first: exiting early hands the parent an EPIPE instead of a reply. */
  while (fread(buf, 1, sizeof buf, stdin) > 0) {
    /* discard */
  }

  fputs("{\"result\":\"{\\\"status\\\":\\\"SUCCEEDED\\\",\\\"summary\\\":\\\"argv echoed\\\"}\"", stdout);
  fputs(",\"usage\":{\"input_tokens\":10,\"cache_read_input_tokens\":0}", stdout);
  printf(",\"argv_echo\":{\"argc\":%d,\"argv\":[", argc);
  for (int i = 1; i < argc; i++) {
    if (i > 1) putchar(',');
    put_json_string(argv[i]);
  }
  fputs("]}}", stdout);

  fflush(stdout);
  return 0;
}
