# Hetzner runbook (primary deployment path)

EU-hosted, self-managed, boring on purpose. Target: one CX22-class VM
(2 vCPU / 4 GB, ~€4/mo) running the server + Postgres via Docker Compose
behind Caddy for TLS. Fits a production MCP server for a single SaaS
comfortably.

## 1. Provision

- Hetzner Cloud → new server: Ubuntu 24.04 LTS, CX22, location Falkenstein
  or Nuremberg (EU, GDPR story intact).
- Add your SSH key. Enable the firewall: allow 22/tcp, 80/tcp, 443/tcp only.

```sh
ssh root@YOUR_IP
apt-get update && apt-get -y upgrade
curl -fsSL https://get.docker.com | sh
```

## 2. TLS + reverse proxy (Caddy)

MCP clients require HTTPS. Point a DNS A record (e.g. `mcp.yourdomain.com`)
at the VM, then run Caddy — it provisions Let's Encrypt automatically:

```sh
mkdir -p /opt/mcp && cd /opt/mcp
cat > Caddyfile <<'EOF'
mcp.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
EOF
docker run -d --name caddy --network host \
  -v /opt/mcp/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data caddy:2
```

## 3. Deploy the server

```sh
git clone https://github.com/Lumina-AI-studio/mcp-production-kit.git /opt/mcp/app
cd /opt/mcp/app
```

Edit `deploy/docker-compose.yml` for production:

- `MCP_ALLOWED_HOSTS: 'mcp.yourdomain.com'` (Host header seen behind Caddy)
- change the Postgres password; keep the audit DB unreachable from outside
  (compose default: no published port — leave it that way)
- **set `AUTH_ISSUER` + `MCP_RESOURCE_URL`** to enable OAuth (see
  [adapters/keycloak](../adapters/keycloak/README.md)) and **remove
  `DEV_GRANTED_SCOPES`** — that variable is a dev-mode escape hatch that only
  has effect while `AUTH_ISSUER` is unset, and production always runs with
  auth on
- change the server port mapping to `'127.0.0.1:3000:3000'` so only Caddy
  can reach it

```sh
docker compose -f deploy/docker-compose.yml up -d --build
curl -fsS https://mcp.yourdomain.com/healthz
curl -fsS https://mcp.yourdomain.com/readyz   # checks the audit DB too
```

Migrations in `deploy/migrations/` run automatically on the first Postgres
boot. For later migrations:

```sh
docker compose -f deploy/docker-compose.yml exec -T audit-db \
  psql -U mcp -d mcp_audit < deploy/migrations/00X_your_migration.sql
```

## 4. Verify the audit trail

```sh
docker compose -f deploy/docker-compose.yml exec audit-db \
  psql -U mcp -d mcp_audit -c \
  'SELECT occurred_at, actor, tool, status, latency_ms FROM audit_events ORDER BY id DESC LIMIT 10;'
```

`UPDATE`/`DELETE` on `audit_events` fail by trigger — that is the point.

## 5. Updates

```sh
cd /opt/mcp/app && git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

## Alternative: Fly.io

If you prefer a PaaS, see [flyio.md](flyio.md). Note the data-residency
story changes — pick an EU region explicitly.
