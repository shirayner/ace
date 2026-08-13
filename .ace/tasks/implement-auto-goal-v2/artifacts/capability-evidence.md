# clean-context capability evidence

- Date: 2026-08-13
- Backend: native `claude.exe` resolved from the installed Claude Code shim
- Isolation argv: `--bare --no-session-persistence --setting-sources '' --tools '' --output-format json --max-turns 1`
- Shell: disabled
- Parent session/auth variables: stripped by `cleanEnv`

## Live dispatch

- Dispatch: `capability-live-001`
- Exit: 0
- Injected payload: 570 bytes
  - system prompt: 395 bytes
  - objective: 175 bytes
  - JSON schema: 0 bytes
- Worker model ingestion: 299 tokens, including cache-read/cache-creation tokens
- Raw capture: 1255 bytes
- Raw SHA-256: `7d023d08da373e59a5f6358e03cb62a56aaa271101e7239a398334f275838eb6`
- Raw pointer: `artifacts/raw/capability-live-001-7d023d08da37.raw`
- Main-agent envelope: 270 bytes
- Result: `SUCCEEDED`

The dispatcher captured and persisted the raw CLI stream before parsing it. The main process received only the bounded projection and audit metadata; the raw artifact was not read into the main model.

## Pre-ingestion budget proof

A 17,000-byte objective produced a 17,395-byte launch payload. The 16 KiB gate returned `DISPATCH_REJECTED` with `audit.launched=false`; no worker process was started.

## Conclusion

The available backend satisfies the implementation gate for a fresh, tool-less, history-free worker and performs launch-budget rejection before model ingestion. This evidence does not authorize a fallback to ordinary Agent calls; absence of this backend remains a hard block.
