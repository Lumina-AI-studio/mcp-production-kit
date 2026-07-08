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

M2 of the [roadmap](docs/ROADMAP.md) is done. The server runs as an OAuth 2.1
**resource server** per the current MCP auth spec (2025-11-25): RFC 9728
protected-resource metadata, JWKS token validation with audience binding,
token scopes driving deny-by-default per-tool RBAC — and every call (allowed,
failed, or denied) lands in the append-only audit log. Keycloak is the
default IdP ([adapters/keycloak](adapters/keycloak/README.md)); Auth0 mapping
included. The runnable Supabase example (M3) is next.

## Layout

```
src/server.ts        Streamable HTTP transport, session handling      (M1)
src/tools/           tool registry — zod schemas, task-oriented tools
src/auth/            OAuth 2.1 resource server (JWKS, audience binding)
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
