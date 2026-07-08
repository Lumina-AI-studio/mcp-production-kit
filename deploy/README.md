# deploy — EU-first deployment recipes

- [Dockerfile](Dockerfile) — multi-stage build, non-root, healthcheck
- [docker-compose.yml](docker-compose.yml) — server + Postgres audit store,
  migrations auto-applied on first boot
- [migrations/](migrations/) — audit table, append-only enforced by trigger
- [hetzner-runbook.md](hetzner-runbook.md) — **primary path**: Hetzner VM,
  Caddy TLS, compose
- [flyio.md](flyio.md) — PaaS alternative sketch
