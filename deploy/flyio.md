# Fly.io (alternative path)

Sketch — the Hetzner runbook is the primary, fully-tested path.

```sh
fly launch --dockerfile deploy/Dockerfile --region ams --no-deploy
fly postgres create --region ams --name mcp-audit-db
fly postgres attach mcp-audit-db      # sets DATABASE_URL
fly secrets set AUDIT_DATABASE_URL="$(fly ssh console -C 'printenv DATABASE_URL')" \
  MCP_ALLOWED_HOSTS='your-app.fly.dev'
fly deploy
```

Apply `deploy/migrations/001_audit_events.sql` via `fly postgres connect`.
Pick an EU region (`ams`, `fra`) if the EU data-residency story matters to
you — it is the default assumption everywhere else in this template.
