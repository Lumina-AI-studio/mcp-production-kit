-- Audit events: append-only by construction.
-- Run as a superuser / owner role; the app role gets INSERT + SELECT only.

CREATE TABLE IF NOT EXISTS audit_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor       TEXT        NOT NULL,
  tool        TEXT        NOT NULL,
  args_hash   TEXT        NOT NULL,
  status      TEXT        NOT NULL CHECK (status IN ('ok', 'error', 'denied', 'rate_limited')),
  latency_ms  INTEGER     NOT NULL,
  trace_id    TEXT        NOT NULL,
  session_id  TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx ON audit_events (occurred_at);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor);
CREATE INDEX IF NOT EXISTS audit_events_tool_idx ON audit_events (tool);

-- Enforce append-only at the database level, belt and braces:
-- 1) the app role may only INSERT/SELECT (adjust role name to your setup);
-- 2) a trigger rejects UPDATE/DELETE regardless of role.

-- REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM your_app_role;

CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update_delete ON audit_events;
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
