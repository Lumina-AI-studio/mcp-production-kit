# mcp-production-kit

**Production-ready TypeScript MCP server template — OAuth 2.1, RBAC, audit logs.**

[![CI](https://github.com/Lumina-AI-studio/mcp-production-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Lumina-AI-studio/mcp-production-kit/actions/workflows/ci.yml)

Most MCP server examples stop at "it works in the Inspector". Production needs
the other 80%: **who is calling, what are they allowed to do, and what did
they actually do.** This is a clone-and-adapt remote MCP server that ships
that part:

- **Streamable HTTP** transport via the official `@modelcontextprotocol/sdk`
- **OAuth 2.1 resource server** — token validation (JWKS), protected-resource
  metadata, audience binding, per the current MCP authorization spec
- **Per-tool RBAC** — deny-by-default scope map; read-only tools by default,
  write tools behind explicit scopes + confirmation payloads
- **Append-only audit logging** — actor, tool, args hash, status, latency,
  trace id for every call; GDPR-aware (args hashed, PII redaction hooks)
- **Rate limiting, tests, evals** — vitest + scripted MCP Inspector flows
- **EU-first deployment** — Hetzner runbook (Fly.io alternative), Keycloak as
  the default self-hosted IdP

## See it run (5 minutes)

```sh
git clone https://github.com/Lumina-AI-studio/mcp-production-kit
cd mcp-production-kit && pnpm install
pnpm example:up      # Keycloak (realm pre-imported) + Postgres (seeded) + server
```

Then point the MCP Inspector (`npx @modelcontextprotocol/inspector`) at
`http://localhost:3000/mcp` (use `localhost`, not `127.0.0.1` — it must match
the server's resource identity), set the OAuth **Client ID** to `inspector`,
and Connect: it discovers the authorization server via RFC 9728, runs the
OAuth 2.1 + PKCE flow (log in as `demo`/`demo`), and calls the five
task-oriented tools of the bundled [Nordwind demo SaaS](example/README.md).
Every call — allowed, failed, denied, or rate-limited — lands as an
append-only audit row you can query in Postgres. The full walkthrough,
including raw curl JSON-RPC, is in [example/README.md](example/README.md).

## What this is not

Not a gateway, not a multi-tenant control plane, not a hosted service, not a
tool marketplace. One server, one SaaS, done well.

## How it works

The server is an OAuth 2.1 **resource server** per the current MCP
authorization spec (**2025-11-25**): it serves RFC 9728 protected-resource
metadata, validates JWTs against your IdP's JWKS with strict issuer +
**audience binding** (tokens minted for other resources are rejected; token
passthrough is forbidden), and extracts token scopes. Every tool call then
goes through a single execution path:

```
RBAC (deny-by-default) → rate limit → handler → audit event
```

A tool without a scope mapping is not callable, by anyone. Write tools
require a dedicated write scope and a structured confirmation payload. Audit
events carry actor, tool, args hash (raw args are never stored), status,
latency and trace id — the answer to "which agent did what, when, with what
data". Keycloak is the default IdP
([adapters/keycloak](adapters/keycloak/README.md), EU self-host); the
[Auth0 mapping](adapters/auth0/README.md) is included. Tool-selection
[evals](docs/tool-design.md#5-evals) (`pnpm evals`, needs `ANTHROPIC_API_KEY`)
check that an agent actually picks the right tool from your descriptions.

## Layout

```
src/server.ts        Streamable HTTP transport, session handling
src/tools/           tool registry — zod schemas, task-oriented tools
src/auth/            OAuth 2.1 resource server (JWKS, audience binding)
src/rbac/            per-tool scope map, deny-by-default
src/audit/           structured audit middleware, append-only sink
src/rate-limit/      per-client + per-tool token-bucket limits
src/observability/   trace ids, health endpoints (OTel planned)
adapters/            IdP adapters: Keycloak (default), Auth0
example/             Nordwind demo SaaS: 5 tools, Keycloak, Postgres
test/                vitest + MCP Inspector scripts + tool evals
deploy/              Dockerfile, compose, Hetzner runbook, Fly.io alt
docs/                tool-design guide, adaptation guide, auth-spec summary
```

## Development

Node ≥ 22, pnpm.

```sh
pnpm install
pnpm lint && pnpm test && pnpm build
```

Design principles live in [docs/tool-design.md](docs/tool-design.md) — start
there before adding tools. Turning the template into *your* server:
[docs/adaptation-guide.md](docs/adaptation-guide.md).

## License

[MIT](LICENSE)
