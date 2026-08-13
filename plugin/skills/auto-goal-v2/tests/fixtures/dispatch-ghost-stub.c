/*
 * A backend whose output outlives the process the dispatcher spawned.
 *
 * Why this shape and not simply "write a lot of bytes": on this platform a child that writes
 * its own stdout and exits always has its pipe drained before Node emits `'exit'` — measured
 * at 4 KiB x 400 and 512 KiB x 120 with 8-way concurrency and with a blocked event loop, zero
 * separations. A payload-size test therefore cannot distinguish settling on `'exit'` from
 * settling on `'close'`, and would pass against the defect.
 *
 * What does separate them is ownership of the write handle. This stub spawns a copy of itself,
 * which inherits stdout, and then exits immediately. Node sees the spawned process terminate
 * and fires `'exit'` while the pipe is still open and still empty; `'close'` only arrives once
 * the grandchild has finished writing and released the handle. Measured 6/6: `'exit'` observes
 * 0 bytes, `'close'` observes all 512 KiB. That is a deterministic reproduction rather than a
 * timing hope, which is what lets the mutation `'close'` -> `'exit'` be killed reliably.
 *
 * This is not a contrived topology. It is what any backend that shells out, uses a launcher or
 * keeps a helper process does, and the real Claude CLI is distributed as exactly such a shim
 * (`backend-resolve.mjs` documents the .cmd/.exe pair). A dispatcher that reads stdout on
 * `'exit'` rejects those backends at random with `cli_output_unparseable`.
 *
 * Roles cannot travel in argv: `dispatchWorker` always spawns the fixed argv from
 * `buildArgs()`, so both roles see identical arguments. On Windows the environment carries the
 * role and `_putenv` before `_spawnl` is what the grandchild inherits; on POSIX `fork()` keeps
 * the role in the forked process's own control flow and the variable is never needed.
 *
 *   ACE_GHOST_REPLY_FILE=<path>  bytes to emit, verbatim. Required; without it the stub
 *                                writes nothing, which is itself a usable case.
 *   ACE_GHOST_DELAY_MS=<n>       writer delay before writing, default 300. The point is
 *                                only that the spawned process is already gone by then.
 *   ACE_GHOST_ROLE=writer        Windows only, set by the stub for its own grandchild; never
 *                                set by the test.
 */

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <process.h>
#include <windows.h>
#define NAP_MS(ms) Sleep((DWORD)(ms))
#else
#include <unistd.h>
#define NAP_MS(ms) usleep((unsigned)(ms) * 1000)
#endif

#define READ_BLOCK 65536

static long env_long(const char *name, long fallback) {
  const char *raw = getenv(name);
  if (raw == NULL || raw[0] == '\0') return fallback;
  return strtol(raw, NULL, 10);
}

/* Read a whole file as bytes. Returns NULL if it cannot be opened or allocated. */
static char *read_file(const char *path, size_t *out_len) {
  FILE *handle = fopen(path, "rb");
  if (handle == NULL) return NULL;

  size_t capacity = READ_BLOCK;
  size_t length = 0;
  char *buffer = (char *)malloc(capacity);
  if (buffer == NULL) {
    fclose(handle);
    return NULL;
  }
  for (;;) {
    if (length + READ_BLOCK > capacity) {
      capacity *= 2;
      char *grown = (char *)realloc(buffer, capacity);
      if (grown == NULL) {
        free(buffer);
        fclose(handle);
        return NULL;
      }
      buffer = grown;
    }
    size_t read = fread(buffer + length, 1, READ_BLOCK, handle);
    length += read;
    if (read < READ_BLOCK) break;
  }
  fclose(handle);
  *out_len = length;
  return buffer;
}

/*
 * Detach a writer that inherits stdout, then return so the spawned process terminates.
 *
 * On Windows `_spawnl(_P_NOWAIT)` is the only option: there is no fork, and the child
 * inherits the standard handles. On POSIX `fork()` does the same thing more directly — the
 * parent returns immediately while the forked writer keeps the inherited descriptor.
 */
static int detach_writer(void) {
#ifdef _WIN32
  char self[MAX_PATH];
  /* argv[0] is whatever the parent passed and need not be resolvable; the module path is. */
  if (GetModuleFileNameA(NULL, self, MAX_PATH) == 0) {
    /* Silence here would exit 0 with no writer ever detached, which reaches the dispatcher as
       `raw_bytes == 0` -- indistinguishable from a writer that was killed before it wrote. */
    fprintf(stderr, "stub: GetModuleFileNameA failed (error %lu)\n", GetLastError());
    fflush(stderr);
    return 1;
  }
  _putenv("ACE_GHOST_ROLE=writer");
  if (_spawnl(_P_NOWAIT, self, self, NULL) == -1) {
    fprintf(stderr, "stub: cannot spawn the detached writer: %s\n", strerror(errno));
    fflush(stderr);
    return 1;
  }
  return 0;
#else
  pid_t pid = fork();
  if (pid < 0) {
    fprintf(stderr, "stub: fork failed: %s\n", strerror(errno));
    fflush(stderr);
    return 1;
  }
  if (pid > 0) return 0; /* the process the dispatcher spawned exits now */
  /* The forked writer continues into the writing branch below. */
  return -1;
#endif
}

int main(void) {
#ifdef _WIN32
  /* Text mode would rewrite \n as \r\n and change every byte count and digest. */
  _setmode(_fileno(stdout), _O_BINARY);
#endif

  const char *role = getenv("ACE_GHOST_ROLE");
  int is_writer = role != NULL && strcmp(role, "writer") == 0;

  if (!is_writer) {
    int outcome = detach_writer();
    if (outcome >= 0) return outcome; /* the spawned process is done; only the writer goes on */
    is_writer = 1;
  }

  NAP_MS(env_long("ACE_GHOST_DELAY_MS", 300));

  /* No reply file is a MODE, not a failure: `measureDetachLatency` runs the stub exactly this
     way to time the detach without ever reading what the writer produces. So this one stays
     quiet -- unlike the read failure below, which has no legitimate caller. */
  const char *reply_file = getenv("ACE_GHOST_REPLY_FILE");
  if (reply_file == NULL || reply_file[0] == '\0') return 0;

  size_t length = 0;
  char *bytes = read_file(reply_file, &length);
  if (bytes == NULL) {
    fprintf(stderr, "stub: cannot read ACE_GHOST_REPLY_FILE %s: %s\n", reply_file, strerror(errno));
    fflush(stderr);
    return 42;
  }

  size_t written = 0;
  while (written < length) {
    size_t take = length - written > READ_BLOCK ? READ_BLOCK : length - written;
    /* A short write means the parent already hung up; stop quietly rather than spin. */
    if (fwrite(bytes + written, 1, take, stdout) < take) break;
    written += take;
  }
  fflush(stdout);
  free(bytes);
  return 0;
}
