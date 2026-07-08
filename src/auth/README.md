# src/auth — OAuth 2.1 resource server

Implemented against MCP authorization spec **2025-11-25**
([summary](../../docs/mcp-authorization-spec-summary.md)). Re-verify against
the live spec before changing anything here — it moves fast.

- [verifier.ts](verifier.ts) — JWKS JWT validation: signature, issuer,
  expiry, **audience binding** to `MCP_RESOURCE_URL` (RFC 8707/9068).
  Tokens minted for other resources are rejected; inbound tokens are never
  forwarded upstream.
- [discovery.ts](discovery.ts) — AS metadata discovery (RFC 8414 + OIDC),
  spec-ordered endpoints, PKCE-support check.
- [index.ts](index.ts) — `buildAuthContext()`: wires the above from env
  (`AUTH_ISSUER`, `MCP_RESOURCE_URL`, optional `AUTH_JWKS_URL`).

HTTP enforcement lives in `src/server.ts`: the SDK's `mcpAuthMetadataRouter`
serves RFC 9728 protected-resource metadata, `requireBearerAuth` 401s with a
`WWW-Authenticate` challenge carrying `resource_metadata`. Per-tool scope
denial stays in `src/audit/execute.ts` so every denial is an audit event.

IdP setup: [adapters/keycloak](../../adapters/keycloak/README.md) (default),
[adapters/auth0](../../adapters/auth0/README.md).
