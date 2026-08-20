/*
 * Stub clean-context backend for the offline dispatch-pipeline regression.
 *
 * Why a compiled native binary: `dispatchWorker` always spawns the backend with the fixed
 * Claude-CLI argv from `buildArgs()` and `shell: false`. `node.exe` rejects that argv
 * outright ("bad option: --bare") because the flags precede any script path, and a
 * `.cmd`/`.bat` shim cannot be spawned without a shell (the EINVAL constraint
 * `backend-resolve.mjs` documents). A native executable that ignores argv is the only
 * stand-in that exercises the real spawn path without a test backdoor in product code.
 *
 * Why the reply arrives on stdin rather than in an environment variable: this suite needs
 * byte-exact multi-byte UTF-8. Node hands `objective` to the child's stdin as UTF-8, but
 * hands environment variables to Windows as UTF-16, where MinGW's `getenv` would return a
 * code-page transcoding — the very corruption under test. So all non-ASCII bytes travel
 * through stdin and only ASCII integers travel through the environment.
 *
 * Contract: read stdin to EOF, transform, write to stdout, exit 0. A rejection must always
 * come from the dispatcher's rules, never from a non-zero exit code.
 *
 *   ACE_STUB_PAD_REPEATS=<n>   expand the single `<<PAD:bytes:PAD>>` token in stdin by
 *                              repeating `bytes` n times. Lets a ~1 KB objective produce a
 *                              payload large enough to span many pipe chunks.
 *   ACE_STUB_SPLIT_AT=<n>      flush after n bytes, pause, then write the rest. Pointing n
 *                              inside a multi-byte character makes the split deterministic
 *                              instead of hoping the OS lands one there.
 *   ACE_STUB_FILL_BYTES=<n>    ignore stdin and emit n 'X' bytes, for the capture cap.
 *   ACE_STUB_REPLY_FILE=<path> read the reply from this file instead of from stdin. Needed
 *                              because stdin now carries the §2 input envelope, whose
 *                              `objective` is capped at 400 bytes by schema — too small to
 *                              smuggle a multi-KB canned reply through. The path is ASCII, so
 *                              it survives the environment on Windows; the file's bytes are
 *                              copied out verbatim, which is what keeps the UTF-8 fidelity
 *                              test honest.
 */

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#define NAP_MS(ms) Sleep(ms)
#else
#include <unistd.h>
#define NAP_MS(ms) usleep((ms) * 1000)
#endif

#define READ_BLOCK 65536
#define PAD_OPEN "<<PAD:"
#define PAD_CLOSE ":PAD>>"

/*
 * Why an internal failure must be loud.
 *
 * Every failure path here used to `return 0` with nothing written. To the dispatcher that is
 * byte-identical to a backend that ran fine and chose to reply with nothing: empty stdout,
 * empty stderr, exit 0. The pipeline then reports `cli_output_unparseable` -- naming the
 * symptom while destroying the cause. A post-fix census caught exactly that shape once in 75
 * runs (raw artifact digest e3b0c44298fc, i.e. sha256 of zero bytes) and the log could not say
 * whether the reply file failed to open or the reply was genuinely empty.
 *
 * The dispatcher does not gate on `exit_code`, so the non-zero status alone would change
 * nothing; what makes the next occurrence attributable is the stderr text, which
 * `pickRawStream` promotes into the raw artifact when stdout is empty. The status is still set
 * so a human reading a transcript sees a failure rather than a clean exit.
 */
static int die(const char *what, const char *detail) {
  if (detail == NULL) {
    fprintf(stderr, "stub: %s\n", what);
  } else {
    fprintf(stderr, "stub: %s: %s (errno %d: %s)\n", what, detail, errno, strerror(errno));
  }
  fflush(stderr);
  return 42;
}

static void binary_streams(void) {
#ifdef _WIN32
  /* Text mode would rewrite \n as \r\n and change every byte count and digest. */
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
}

static long env_long(const char *name, long fallback) {
  const char *raw = getenv(name);
  if (raw == NULL || raw[0] == '\0') return fallback;
  return strtol(raw, NULL, 10);
}

/* Read all of stdin. Returns NULL on allocation failure. */
static char *read_stdin(size_t *out_len) {
  size_t capacity = READ_BLOCK;
  size_t length = 0;
  char *buffer = (char *)malloc(capacity);
  if (buffer == NULL) return NULL;

  for (;;) {
    if (length + READ_BLOCK > capacity) {
      capacity *= 2;
      char *grown = (char *)realloc(buffer, capacity);
      if (grown == NULL) {
        free(buffer);
        return NULL;
      }
      buffer = grown;
    }
    size_t read = fread(buffer + length, 1, READ_BLOCK, stdin);
    length += read;
    if (read < READ_BLOCK) break;
  }
  *out_len = length;
  return buffer;
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

/* Search for a needle in a byte range; the payload may contain NUL-free UTF-8 only. */
static char *find_in(char *haystack, size_t haystack_len, const char *needle) {
  size_t needle_len = strlen(needle);
  if (needle_len == 0 || haystack_len < needle_len) return NULL;
  for (size_t i = 0; i + needle_len <= haystack_len; i++) {
    if (memcmp(haystack + i, needle, needle_len) == 0) return haystack + i;
  }
  return NULL;
}

static void write_split(const char *bytes, size_t length, long split_at) {
  if (split_at > 0 && (size_t)split_at < length) {
    fwrite(bytes, 1, (size_t)split_at, stdout);
    fflush(stdout);
    /* Long enough that Node delivers two separate 'data' events, so a per-chunk
       decoder provably corrupts the character straddling the boundary. */
    NAP_MS(250);
    fwrite(bytes + split_at, 1, length - (size_t)split_at, stdout);
  } else {
    fwrite(bytes, 1, length, stdout);
  }
  fflush(stdout);
}

int main(void) {
  binary_streams();

  long fill_bytes = env_long("ACE_STUB_FILL_BYTES", 0);
  long split_at = env_long("ACE_STUB_SPLIT_AT", 0);

  size_t stdin_len = 0;
  char *stdin_bytes = read_stdin(&stdin_len);
  if (stdin_bytes == NULL) return die("cannot buffer stdin", "allocation failed");

  /* stdin carries the input envelope, which is drained above so the parent never sees an
     EPIPE. When a reply file is named, that file -- not the envelope -- is the reply. */
  const char *reply_file = getenv("ACE_STUB_REPLY_FILE");
  if (reply_file != NULL && reply_file[0] != '\0') {
    size_t file_len = 0;
    char *file_bytes = read_file(reply_file, &file_len);
    free(stdin_bytes);
    if (file_bytes == NULL) return die("cannot read ACE_STUB_REPLY_FILE", reply_file);
    stdin_bytes = file_bytes;
    stdin_len = file_len;
  }

  if (fill_bytes > 0) {
    char block[READ_BLOCK];
    memset(block, 'X', sizeof block);
    long remaining = fill_bytes;
    while (remaining > 0) {
      size_t take = remaining > (long)sizeof block ? sizeof block : (size_t)remaining;
      /* A short write means the parent already hung up after killing us; stop quietly. */
      if (fwrite(block, 1, take, stdout) < take) break;
      remaining -= (long)take;
    }
    fflush(stdout);
    free(stdin_bytes);
    return 0;
  }

  char *open = find_in(stdin_bytes, stdin_len, PAD_OPEN);
  char *close = open == NULL
                    ? NULL
                    : find_in(open, stdin_len - (size_t)(open - stdin_bytes), PAD_CLOSE);
  if (open == NULL || close == NULL) {
    write_split(stdin_bytes, stdin_len, split_at);
    free(stdin_bytes);
    return 0;
  }

  const char *unit = open + strlen(PAD_OPEN);
  size_t unit_len = (size_t)(close - unit);
  long repeats = env_long("ACE_STUB_PAD_REPEATS", 1);
  if (repeats < 0) repeats = 0;

  size_t head_len = (size_t)(open - stdin_bytes);
  const char *tail = close + strlen(PAD_CLOSE);
  size_t tail_len = stdin_len - (size_t)(tail - stdin_bytes);
  size_t total = head_len + unit_len * (size_t)repeats + tail_len;

  char *reply = (char *)malloc(total > 0 ? total : 1);
  if (reply == NULL) {
    free(stdin_bytes);
    return die("cannot allocate the padded reply", "allocation failed");
  }
  memcpy(reply, stdin_bytes, head_len);
  size_t cursor = head_len;
  for (long i = 0; i < repeats; i++) {
    memcpy(reply + cursor, unit, unit_len);
    cursor += unit_len;
  }
  memcpy(reply + cursor, tail, tail_len);

  write_split(reply, total, split_at);
  free(reply);
  free(stdin_bytes);
  return 0;
}
