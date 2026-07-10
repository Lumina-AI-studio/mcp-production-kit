# MCP Authorization Spec — implementation summary

**Spec revision: 2025-11-25** (fetched 2026-07-08 from
<https://modelcontextprotocol.io/specification/latest/basic/authorization>).
Re-verify against the live spec before touching `src/auth` — this document is
a snapshot, not a source of truth.

## Our role

This template is the **MCP server = OAuth 2.1 resource server**. We validate
tokens; we never issue them. The authorization server (Keycloak or Auth0
via `adapters/`) is external. Base standards: OAuth 2.1
(draft-ietf-oauth-v2-1-13), RFC 9728 (Protected Resource Metadata), RFC 8414
(AS Metadata), RFC 8707 (Resource Indicators), plus the new Client ID Metadata
Documents draft.

## MUSTs for the server (implemented in `src/auth`)

1. **Protected Resource Metadata (RFC 9728) is mandatory.** Serve it at
   `/.well-known/oauth-protected-resource` (root or endpoint-path variant),
   with an `authorization_servers` field listing at least one AS. Clients use
   it for AS discovery.
2. **401 handling:** invalid/missing/expired token → HTTP 401 with a
   `WWW-Authenticate: Bearer` header carrying `resource_metadata="<url>"`;
   SHOULD also carry `scope="..."` so clients request least privilege.
3. **Token validation (OAuth 2.1 §5.2):** validate signature (JWKS), issuer,
   expiry — and **audience binding is a MUST**: only accept tokens issued
   specifically for this server's canonical URI (RFC 8707 / RFC 9068 `aud`).
   Reject tokens minted for other resources. **Token passthrough is
   forbidden** — never forward the client's token to upstream APIs; if we call
   upstream, we obtain our own token.
4. **Bearer only, header only:** tokens arrive via
   `Authorization: Bearer …` on **every** request (sessions don't exempt);
   tokens in query strings are forbidden.
5. **Error codes:** 401 = missing/invalid token; 403 = valid token,
   insufficient scope; 400 = malformed. On 403, SHOULD send
   `WWW-Authenticate` with `error="insufficient_scope"` +
   `scope="<needed>"` + `resource_metadata` — this powers client **step-up
   authorization** and maps directly onto our per-tool RBAC denials.

## Client-side facts that shape our tests

- Clients MUST send RFC 8707 `resource=<canonical server URI>` in
  authorization + token requests; our canonical URI must be stable and
  documented (lowercase scheme/host, no fragment, no trailing slash).
- Client registration priority is now: pre-registered → **Client ID Metadata
  Documents** (HTTPS-URL-as-client_id; the AS SHOULD support it, advertised
  via `client_id_metadata_document_supported`) → Dynamic Client Registration
  (RFC 7591, now **MAY**, kept for backwards compatibility). This is the
  notable change from the 2025-06-18 revision — Keycloak/Auth0 adapter docs
  must cover CIMD support/workarounds.
- Clients discover AS metadata via RFC 8414 and/or OIDC Discovery; our
  adapters must confirm the IdP exposes one of them, including
  `code_challenge_methods_supported` (clients MUST refuse an AS without PKCE
  support).

## Consequences for this repo

- `src/auth/` implements: PRM endpoint, JWKS-based JWT validation with strict
  audience check, scope extraction into the RBAC layer, spec-shaped
  401/403 responses.
- Negative tests required (CLAUDE.md): wrong audience → 401, wrong scope →
  403 with `insufficient_scope`, token in query string → rejected, write tool
  with read-only scope → 403 + audit event `denied`.
- Scope challenges (`WWW-Authenticate` `scope` param) should list the exact
  scopes from the tool's RBAC mapping, enabling step-up flows.
- Authorization is transport-level and OPTIONAL in MCP generally, but this
  template's whole point is shipping it on: HTTP transport ⇒ conform to this
  spec.
