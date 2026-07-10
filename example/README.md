# example — Nordwind demo SaaS (M3)

A complete, runnable vertical slice of the template: a small B2B e-commerce
ops SaaS ("Nordwind") exposed through **five task-oriented MCP tools**, behind
**OAuth 2.1 + per-tool RBAC**, with **every call audited**. It is the concrete
answer to "what does a real server built on this kit look like?".

The stack (`pnpm example:up`) is three containers:

| Service     | Purpose                                              | Host port |
| ----------- | ---------------------------------------------------- | --------- |
| `keycloak`  | OAuth 2.1 authorization server (realm `mcp-example`) | 8080      |
| `db`        | Postgres — audit log **and** Nordwind domain data    | internal  |
| `mcp-server`| The MCP server running the example tools             | 3000      |

## The tools

| Tool                     | Scope             | Kind  | What it does                                                   |
| ------------------------ | ----------------- | ----- | ------------------------------------------------------------- |
| `search_customers`       | `customers:read`  | read  | Search customers by name/email fragment.                      |
| `get_order_details`      | `orders:read`     | read  | One order + its invoices + refund history.                    |
| `list_overdue_invoices`  | `invoices:read`   | read  | Unpaid invoices past due, oldest first.                       |
| `create_refund_request`  | `refunds:write`   | write | Create a refund request (needs a confirmation payload).       |
| `cancel_order`           | `orders:write`    | write | Cancel a not-yet-shipped order (needs a confirmation reason). |

Write tools set `readOnly: false`, require a dedicated write scope, and take a
`confirm` payload restating what they are about to do — see
`docs/tool-design.md`.

## Quickstart

```sh
pnpm example:up          # docker compose up --build (Keycloak + Postgres + server)
# wait until Keycloak is healthy and the realm is imported (~30-60s on first run)
```

Port 8080 already taken on your machine? `KEYCLOAK_PORT=8081 pnpm example:up`
moves Keycloak (the issuer URL follows automatically; pass the matching
`TOKEN_URL` to `test/inspector/m3-flow.sh`).

Tear down with `pnpm example:down` (add `-v` manually to wipe the seeded DB).

### 1. Get a token (client credentials)

> **DEV-ONLY credentials.** Everything in this realm — `demo-secret`,
> `demo`/`demo`, Keycloak's `admin`/`admin` — is a published throwaway for
> the local demo stack. If you adapt this realm file for a real deployment,
> regenerate every secret and password first.

The realm ships a confidential client `demo-agent` whose tokens carry all six
scopes by default:

```sh
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/mcp-example/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=demo-agent \
  -d client_secret=demo-secret | jq -r .access_token)
```

The token is **audience-bound** to `http://localhost:3000/mcp` (an Audience
protocol mapper on each client scope) — the server rejects tokens without it.

Note: `demo-agent`'s scopes are **default** client scopes, so Keycloak puts
all six in every token regardless of any `scope=` parameter — you cannot mint
a reduced token from this client. To see a scope denial live, use the
`inspector` client (its scopes are *optional*: grant only some in the OAuth
consent) — denied calls land in the audit log with `status=denied`.

### 2. Call the server (raw JSON-RPC)

Streamable HTTP wants both content types in `Accept`, and a session id from
`initialize`:

```sh
# initialize — capture the mcp-session-id response header
SID=$(curl -s -D - -o /dev/null -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' \
  | grep -i '^mcp-session-id:' | tr -d '\r' | awk '{print $2}')

# list tools
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" -H "mcp-session-id: $SID" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# call a read tool
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" -H "mcp-session-id: $SID" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_overdue_invoices","arguments":{"olderThanDays":0,"limit":20}}}'
```

The scripted version of this whole flow (token → initialize → tools/list →
read → write, with assertions) is `test/inspector/m3-flow.sh`.

### 3. Connect the MCP Inspector (interactive OAuth)

```sh
npx @modelcontextprotocol/inspector
```

Point it at `http://localhost:3000/mcp` (Streamable HTTP). It discovers the
authorization server via RFC 9728 Protected Resource Metadata and runs the
OAuth 2.1 code flow against the public `inspector` client (PKCE S256, redirect
URIs on `localhost:6274`). Log in as **`demo` / `demo`** and select the tool
scopes you want to grant. Calling a write tool without its scope is **denied
and audited** with `status=denied`.

## Where the audit rows live

Every tool call — ok, error, denied, or rate_limited — writes an append-only row to
`audit_events` in the demo Postgres (`actor`, `tool`, `args_hash`, `status`,
`latency_ms`, `trace_id`, `session_id`). Postgres is internal to the stack, so
inspect it through the container:

```sh
docker compose -f example/docker-compose.yml exec db \
  psql -U mcp -d mcp -c \
  "SELECT occurred_at, actor, tool, status, latency_ms FROM audit_events ORDER BY id DESC LIMIT 20;"
```

Args are hashed, never stored raw (GDPR-aware by construction).

## How it maps back to the template

- Tools: `example/src/tools/` — built with `defineTool` from `src/tools`, one
  file per tool, a narrow injected `Db` seam (`example/src/db.ts`) so the
  handlers are unit-testable without Postgres (`test/example-tools.test.ts`).
- Bootstrap: `example/src/main.ts` mirrors `src/main.ts` — same audit sinks,
  same `buildAuthContext`, same `createApp`; it just registers the example
  tools and wires the domain DB.
- Auth: `example/keycloak/realm-mcp-example.json` — client scopes (one per RBAC
  entry) each with an Audience mapper, a public Inspector client, and the
  confidential `demo-agent`.
- Schema + seed: `example/db/001_schema.sql`.
