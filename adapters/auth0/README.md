# Auth0 adapter

Same generic OIDC/JWKS path as Keycloak — configuration only. Auth0 concepts
map as:

| This server            | Auth0                                            |
| ---------------------- | ------------------------------------------------ |
| `AUTH_ISSUER`          | `https://YOUR_TENANT.auth0.com/` (trailing slash — Auth0's issuer includes it) |
| `MCP_RESOURCE_URL`     | the **API "Identifier"** (Audience) you create   |
| tool `requiredScopes`  | API → Permissions (e.g. `status:read`)           |
| scope claim            | `scope` string — handled; `scp` arrays also handled |

Steps: Applications → APIs → Create API with Identifier =
`https://mcp.yourdomain.com/mcp`; add permissions matching your scope map;
enable RBAC + "Add Permissions in the Access Token" in API settings.

Note EU data residency: pick an EU tenant region. If that matters to you,
Keycloak self-hosted (the default adapter) keeps the story simpler.
