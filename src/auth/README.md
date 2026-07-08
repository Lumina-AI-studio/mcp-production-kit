# src/auth — OAuth 2.1 resource server (M2)

Empty on purpose. Auth lands in M2 and MUST be implemented against the
**current** MCP authorization spec — see
[docs/mcp-authorization-spec-summary.md](../../docs/mcp-authorization-spec-summary.md)
(summarized from spec revision **2025-11-25**) and re-verify against
<https://modelcontextprotocol.io/specification/latest/basic/authorization>
before writing code here. The spec moves fast.

Planned contents:

- Protected Resource Metadata endpoint (RFC 9728) — required by MCP.
- JWT access-token validation via JWKS (issuer, expiry, **audience binding**
  per RFC 8707 — reject tokens not issued for this server).
- Scope extraction feeding src/rbac.
- 401/403 + `WWW-Authenticate` responses per spec (including
  `resource_metadata` and `scope` parameters).
