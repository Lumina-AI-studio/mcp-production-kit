# test/inspector — scripted MCP Inspector checks

- [m1-check.sh](m1-check.sh) — connect over Streamable HTTP, `tools/list`,
  call `get_service_status`. Run against a locally started server
  (`DEV_GRANTED_SCOPES=status:read pnpm dev`).

The full scripted flow against the example stack is `m3-flow.sh`; the
per-tool eval harness lives in `test/evals/`.

Note: the same connect → list → call → audit-row assertion also runs fully
in-process in `test/server.integration.test.ts` via the official SDK client,
so CI covers the M1 acceptance path without spawning the Inspector.
