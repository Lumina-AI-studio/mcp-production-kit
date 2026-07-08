# Roadmap

mcp-production-kit is a clone-and-adapt TypeScript repository: a remote MCP
server (Streamable HTTP, official `@modelcontextprotocol/sdk`) with OAuth 2.1
resource-server auth, per-tool RBAC, structured audit logging, rate limiting,
tests, and EU deployment recipes.

**It is not:** a gateway, a multi-tenant control plane, a hosted service, or a
tool marketplace. One server, one SaaS, done well.

## Repo layout

```
mcp-production-kit/
├─ src/
│  ├─ server.ts          # Streamable HTTP transport, session handling
│  ├─ tools/             # tool registry — zod schemas, task-oriented tools
│  ├─ auth/              # OAuth 2.1 resource server: token validation (JWKS),
│  │                     #   protected-resource metadata, scope extraction
│  ├─ rbac/              # per-tool scope map; read-only default; deny-by-default
│  ├─ audit/             # structured audit middleware: actor, tool, args hash,
│  │                     #   result status, latency, trace id — append-only sink
│  ├─ rate-limit/        # per-client + per-tool limits
│  └─ observability/     # OpenTelemetry traces/metrics, health endpoints
├─ adapters/             # IdP adapters: keycloak/ (EU self-host, default),
│                        #   auth0/, workos/
├─ example/              # demo SaaS (Supabase): 5 tools — 3 read, 2 write w/ confirm
├─ test/                 # vitest + MCP Inspector scripted checks + tool evals
├─ deploy/               # Dockerfile, compose, Hetzner runbook, Fly.io alt
└─ docs/                 # SECURITY.md, tool-design guide, adaptation guide
```

## Design principles (see docs/tool-design.md)

1. **Task-oriented tools, not CRUD dumps** — expose `create_refund_request`,
   not `POST /refunds`. Small tool count beats big context.
2. **Read-only by default** — write tools require explicit scope + structured
   confirmation payloads.
3. **Audit answers the compliance question:** "which agent called which tool
   with what data at what time" — exportable, append-only, GDPR-aware (args
   hashed, PII redaction hooks).
4. **EU-first deployment** — the Hetzner runbook is the primary path.

## Milestones & acceptance criteria

**M0 — Scaffold.** Name check, repo, MIT, CI (lint/test/build), README
positioning statement. ✅ Green CI.

**M1 — Core server + audit.** Streamable HTTP server via official SDK; tool
registry with zod; audit middleware writing structured events to
Postgres/Supabase + stdout JSON; health checks; Docker + Hetzner runbook.
✅ Done when MCP Inspector connects, calls a demo tool, and the audit row
contains actor/tool/args-hash/status/latency.

**M2 — OAuth 2.1 + RBAC.** Resource-server pattern per current MCP auth spec:
protected-resource metadata endpoint, JWT validation via JWKS, scope→tool
RBAC map, deny-by-default. Keycloak adapter first (EU self-host), then Auth0.
✅ Done when an unscoped token can list but not call a write tool, and the
test suite proves it.

**M3 — Example + DX.** Supabase demo SaaS with 5 task-oriented tools; scripted
MCP Inspector test flows; per-tool eval harness (given prompt X, agent selects
tool Y); rate limiting. ✅ Done when `pnpm example:up` gives a working authed
server a Claude client can use end-to-end.

**M4 — Launch.** Polish README, launch post ("what production MCP actually
requires: auth, RBAC, audit").

## Guardrails

1. No gateway, no multi-tenancy, no billing, no hosted offering.
2. One IdP adapter at a time; resist adapter sprawl.
3. Follow the CURRENT MCP spec — verify auth flow details against the official
   docs before changing src/auth (spec moves fast).
