#!/usr/bin/env bash
# M1 acceptance check with the MCP Inspector CLI:
# connect over Streamable HTTP, list tools, call the demo tool.
#
# Prereq: server running locally, e.g.
#   DEV_GRANTED_SCOPES=status:read pnpm start
set -euo pipefail

URL="${MCP_URL:-http://127.0.0.1:3000/mcp}"

echo "==> tools/list against $URL"
npx --yes @modelcontextprotocol/inspector --cli "$URL" \
  --transport http --method tools/list

echo "==> tools/call get_service_status"
npx --yes @modelcontextprotocol/inspector --cli "$URL" \
  --transport http --method tools/call --tool-name get_service_status

echo "==> OK — now check the audit trail (stdout JSON lines or audit_events table)"
