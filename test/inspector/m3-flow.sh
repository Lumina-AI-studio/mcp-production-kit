#!/usr/bin/env bash
# M3 acceptance flow against the running example stack (pnpm example:up):
#   1. client_credentials token from Keycloak (demo-agent / demo-secret)
#   2. JSON-RPC initialize  → capture mcp-session-id
#   3. tools/list           → expect the five Nordwind tools
#   4. tools/call list_overdue_invoices (read)  → expect invoices
#   5. tools/call create_refund_request (write) → expect a refund id
#
# Uses raw curl JSON-RPC (Accept: application/json, text/event-stream) so it
# doubles as copy-paste documentation for calling the server.
#
# Prereq: docker compose -f example/docker-compose.yml up --build   (stack up)
set -euo pipefail

MCP_URL="${MCP_URL:-http://127.0.0.1:3000/mcp}"
TOKEN_URL="${TOKEN_URL:-http://127.0.0.1:8080/realms/mcp-example/protocol/openid-connect/token}"
CLIENT_ID="${CLIENT_ID:-demo-agent}"
CLIENT_SECRET="${CLIENT_SECRET:-demo-secret}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# --- 1. token ---------------------------------------------------------------
echo "==> client_credentials token from $TOKEN_URL"
TOKEN=$(
  curl -sf -X POST "$TOKEN_URL" \
    -d grant_type=client_credentials \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET" |
    sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
)
[ -n "$TOKEN" ] || fail "no access_token returned (is Keycloak up and the realm imported?)"
AUTH="Authorization: Bearer $TOKEN"
ACCEPT="Accept: application/json, text/event-stream"

rpc() {
  # rpc <extra-headers-file-or-empty> <json-body> — prints response body.
  curl -sf -X POST "$MCP_URL" -H "$AUTH" -H "$ACCEPT" \
    -H 'Content-Type: application/json' "$@"
}

# --- 2. initialize (capture session id from response headers) ---------------
echo "==> initialize"
INIT_HEADERS=$(mktemp)
INIT_BODY=$(
  curl -sf -D "$INIT_HEADERS" -X POST "$MCP_URL" -H "$AUTH" -H "$ACCEPT" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"m3-flow","version":"0"}}}'
)
SESSION_ID=$(grep -i '^mcp-session-id:' "$INIT_HEADERS" | tr -d '\r' | awk '{print $2}')
rm -f "$INIT_HEADERS"
[ -n "$SESSION_ID" ] || fail "no mcp-session-id header on initialize response"
echo "$INIT_BODY" | grep -q '"serverInfo"' || fail "initialize did not return serverInfo"
SID="mcp-session-id: $SESSION_ID"

# The initialized notification is required before further requests.
rpc -H "$SID" -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null

# --- 3. tools/list ----------------------------------------------------------
echo "==> tools/list"
TOOLS=$(rpc -H "$SID" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')
for t in search_customers get_order_details list_overdue_invoices create_refund_request cancel_order; do
  echo "$TOOLS" | grep -q "$t" || fail "tools/list missing $t"
done

# --- 4. list_overdue_invoices (read) ----------------------------------------
echo "==> tools/call list_overdue_invoices"
OVERDUE=$(rpc -H "$SID" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_overdue_invoices","arguments":{"olderThanDays":0,"limit":20}}}')
# Tool results arrive as JSON escaped inside content[0].text (\"invoices\"),
# so match the bare word and assert the call was not an error.
echo "$OVERDUE" | grep -q '"isError":true' && fail "list_overdue_invoices returned isError: $OVERDUE"
echo "$OVERDUE" | grep -q 'invoices' || fail "list_overdue_invoices returned no invoices field"
echo "$OVERDUE" | grep -q 'inv_2007' || fail "expected overdue invoice inv_2007 not found"

# --- 5. create_refund_request (write) ---------------------------------------
echo "==> tools/call create_refund_request"
REFUND=$(rpc -H "$SID" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_refund_request","arguments":{"orderId":"ord_1001","confirm":{"amountCents":2900,"reason":"Damaged item on arrival, per m3-flow"}}}}')
echo "$REFUND" | grep -q '"isError":true' && fail "create_refund_request returned isError: $REFUND"
echo "$REFUND" | grep -q 'refundRequest' || fail "create_refund_request returned no refundRequest"
echo "$REFUND" | grep -q 'rr_' || fail "create_refund_request returned no refund id"

echo "==> OK — M3 flow passed. Audit rows are in the db 'audit_events' table:"
echo "    docker compose -f example/docker-compose.yml exec db psql -U mcp -d mcp -c 'SELECT tool,status,actor FROM audit_events ORDER BY id DESC LIMIT 10;'"
