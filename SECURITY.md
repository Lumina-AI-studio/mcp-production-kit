# Security

## Reporting a vulnerability

Please report vulnerabilities privately via GitHub security advisories on
this repository (or email the maintainer). Do not open public issues for
security reports. You should receive a response within 72 hours.

## Security posture of the template

- MCP server acts strictly as an OAuth 2.1 **resource server**; it never
  issues tokens and never forwards inbound tokens upstream (token passthrough
  is forbidden by the MCP spec).
- Access tokens are validated for signature (JWKS), issuer, expiry, and
  **audience** — tokens minted for other resources are rejected.
- RBAC is deny-by-default; write tools require explicit scopes and
  confirmation payloads.
- Every tool call produces an append-only audit event; raw arguments are
  hashed, not stored.

Details: [mcp-authorization-spec-summary.md](docs/mcp-authorization-spec-summary.md).
