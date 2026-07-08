# Adaptation guide

How to turn this template into *your* SaaS's MCP server. Full guide lands
with M3; the intended flow:

1. **Map your API surface to tasks** (docs/tool-design.md): pick ≤10
   task-oriented tools; mark each read or write.
2. **Define the scope model**: one read scope per domain area, dedicated
   write scopes; fill the RBAC scope map.
3. **Wire your IdP** via an adapter in `adapters/` (Keycloak is the EU
   self-host default).
4. **Point the audit sink** at your Postgres/Supabase instance.
5. **Deploy** with `deploy/` (Hetzner runbook primary, Fly.io alternative).
6. **Prove it**: MCP Inspector scripted flows + per-tool eval cases green.
