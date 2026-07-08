# test/inspector — scripted MCP Inspector checks

- [m1-check.sh](m1-check.sh) — connect over Streamable HTTP, `tools/list`,
  call `get_service_status`. Run against a locally started server
  (`DEV_GRANTED_SCOPES=status:read pnpm dev`).

M3 adds full scripted flows against the example server plus the per-tool
eval harness.

Note: the same connect → list → call → audit-row assertion also runs fully
in-process in `test/server.integration.test.ts` via the official SDK client,
so CI covers the M1 acceptance path without spawning the Inspector.
