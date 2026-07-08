# adapters — IdP integrations

One adapter at a time (guardrail #2). Order:

1. `keycloak/` — EU self-host default (M2)
2. `auth0/` — (M2, after Keycloak)
3. `workos/` — later

Each adapter documents: AS metadata discovery (RFC 8414 / OIDC Discovery),
JWKS endpoint, audience configuration for this server's canonical URI,
scope setup, and Client ID Metadata Document support or workarounds.
