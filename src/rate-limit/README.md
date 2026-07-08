# src/rate-limit — per-client + per-tool limits (M3)

Empty on purpose; rate limiting lands in M3. Planned: token-bucket limits
keyed by (client, tool), with write tools getting stricter defaults, and
limit hits emitted as audit events with status `denied`.
