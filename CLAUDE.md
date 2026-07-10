# mcp-production-kit — production-ready TypeScript MCP server template

## What this is
Clone-and-adapt remote MCP server: Streamable HTTP, OAuth 2.1 resource
server, per-tool RBAC, append-only audit logging, rate limits, tests,
EU (Hetzner) deployment. MIT.

## Hard rules
- This is a TEMPLATE, not a platform: no gateway, no multi-tenancy,
  no billing, no hosted mode. Reject scope in that direction.
- Tools are task-oriented verbs with zod schemas; read-only by default;
  write tools require explicit scope + confirmation payload.
- Every tool call MUST produce an audit event (actor, tool, args hash,
  status, latency, trace id). Audit sink is append-only.
- Deny-by-default RBAC. Never ship a tool without a scope mapping.
- Follow the CURRENT MCP spec — verify auth flow details against the
  official docs before changing src/auth (spec moves fast).

## Stack & commands
- Node 22, ESM, strict TS, zod; @modelcontextprotocol/sdk (official).
- vitest; MCP Inspector scripts in /test/inspector.
- `pnpm build` / `pnpm test` / `pnpm lint` green before commit.
- `pnpm example:up` boots the Nordwind demo (Keycloak + Postgres) + server.

## Testing
- Every auth change needs a negative test (wrong scope → 403 path).
- Every new tool needs: schema test, audit-event test, eval case.