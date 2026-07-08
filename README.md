# mcp-production-kit

**Production-ready TypeScript MCP server template — OAuth 2.1, RBAC, audit logs.**

[![CI](https://github.com/Lumina-AI-studio/mcp-production-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Lumina-AI-studio/mcp-production-kit/actions/workflows/ci.yml)

Most MCP server examples stop at "it works in the Inspector". Production needs
the other 80%: who is calling, what are they allowed to do, and what did they
actually do. This is a **clone-and-adapt** remote MCP server that ships that
part:

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

## What this is not

Not a gateway, not a multi-tenant control plane, not a hosted service, not a
tool marketplace. One server, one SaaS, done well.

## Status

Early — M1 of the [roadmap](docs/ROADMAP.md) is done: the Streamable HTTP
server runs, every tool call is audited (stdout JSON + Postgres sink), health
endpoints and the Hetzner deploy path are in place. OAuth 2.1 + RBAC against
a real IdP (M2) and the runnable example (M3) are next — until M2 lands,
scopes come from the `DEV_GRANTED_SCOPES` dev-only escape hatch, so don't
point this at production data yet.

## Layout

```
src/server.ts        Streamable HTTP transport, session handling      (M1)
src/tools/           tool registry — zod schemas, task-oriented tools
src/auth/            OAuth 2.1 resource server                        (M2)
src/rbac/            per-tool scope map, deny-by-default
src/audit/           structured audit middleware, append-only sink
src/rate-limit/      per-client + per-tool limits                     (M3)
src/observability/   OpenTelemetry, health endpoints                  (M1)
adapters/            IdP adapters: Keycloak (default), Auth0, WorkOS
example/             Supabase demo SaaS, 5 tools                      (M3)
test/                vitest + MCP Inspector scripts + tool evals
deploy/              Dockerfile, compose, Hetzner runbook             (M1)
docs/                tool-design guide, adaptation guide, SECURITY.md
```

## Development

Node ≥ 22, pnpm.

```sh
pnpm install
pnpm lint && pnpm test && pnpm build
```

Design principles live in [docs/tool-design.md](docs/tool-design.md) — start
there before adding tools.

## License

[MIT](LICENSE)
