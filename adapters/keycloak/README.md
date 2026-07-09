# Keycloak adapter (EU self-host, default IdP)

Keycloak is the default because it self-hosts in the EU next to the server
(same Hetzner box or a sibling VM) — the whole auth path stays under your
control. The server side needs no Keycloak-specific code: it's plain OIDC
discovery + JWKS. This adapter is configuration.

## Dev instance

```sh
docker compose -f adapters/keycloak/docker-compose.keycloak.yml up -d
# Admin console: http://localhost:8080  (admin / admin — dev only)
```

## Realm & client setup

1. **Create a realm**, e.g. `mcp`. Your issuer is then
   `http://localhost:8080/realms/mcp` (use the HTTPS URL in production).

2. **Create client scopes** matching your tool scope map — for the built-in
   demo tool: `status:read` (Client scopes → Create → name `status:read`,
   type *Optional*). One scope per entry in your RBAC map.

3. **Audience mapper — the step everyone misses.** The MCP spec requires
   tokens to be audience-bound to this server's canonical URI, and this
   server rejects tokens without it. Keycloak does not add custom audiences
   by default:
   - Client scopes → `status:read` → Mappers → Add mapper → *Audience*
   - "Included Custom Audience": your `MCP_RESOURCE_URL`, e.g.
     `https://mcp.yourdomain.com/mcp`
   - Repeat for each client scope (or attach one audience mapper via a
     shared dedicated scope).

4. **Register MCP clients.** Client registration per current MCP spec, in
   priority order:
   - *Pre-registration* (simplest): create a public OIDC client, Standard
     flow on, PKCE S256 (Advanced → Proof Key for Code Exchange), redirect
     URIs for your MCP client (e.g. `http://127.0.0.1:*/callback` for
     desktop clients), attach the client scopes.
   - *Client ID Metadata Documents* (spec-preferred for unknown clients):
     check your Keycloak version's support status before relying on it —
     advertised via `client_id_metadata_document_supported` in the realm's
     AS metadata.
   - *Dynamic Client Registration* (spec fallback): Realm settings → Client
     registration → anonymous access policies. Lock down with policies if
     you enable it.

## Server configuration

```sh
AUTH_ISSUER=https://auth.yourdomain.com/realms/mcp
MCP_RESOURCE_URL=https://mcp.yourdomain.com/mcp
# DEV_GRANTED_SCOPES must be UNSET — token scopes are the only grants now.
```

The server discovers `jwks_uri` from the realm's well-known endpoint at
startup and validates: signature, issuer, expiry, **audience =
MCP_RESOURCE_URL**. Scopes are read from the `scope` claim.

## Verify

```sh
# PRM served by the MCP server, pointing clients at Keycloak:
curl -s https://mcp.yourdomain.com/.well-known/oauth-protected-resource/mcp | jq

# No token → 401 with WWW-Authenticate challenge:
curl -si -X POST https://mcp.yourdomain.com/mcp | grep -i www-authenticate

# With a token from client-credentials or the Inspector's OAuth flow:
# tools/list works; calling a write tool without its scope is denied and
# audited with status=denied.
```

Negative paths are covered in `test/auth.integration.test.ts`.
