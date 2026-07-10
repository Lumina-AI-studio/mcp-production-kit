import pg from 'pg';
import type { AuditEvent } from './index.js';

/**
 * Audit sinks are append-only: this interface deliberately has no read,
 * update or delete surface. Querying/exporting happens out-of-band against
 * the store (see deploy/migrations/001_audit_events.sql, which also revokes
 * UPDATE/DELETE at the database level).
 */
export interface AuditSink {
  write(event: AuditEvent): Promise<void>;
  /** Liveness for /readyz. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Structured JSON lines on stdout — always on, greppable, ship-to-anywhere. */
export class StdoutJsonSink implements AuditSink {
  async write(event: AuditEvent): Promise<void> {
    process.stdout.write(`${JSON.stringify({ audit: event })}\n`);
  }
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
}

/** Postgres/Supabase sink. Table: deploy/migrations/001_audit_events.sql. */
export class PostgresAuditSink implements AuditSink {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    // node-postgres emits 'error' on the pool when an *idle* client's
    // connection dies (DB restart, failover, network RST, idle timeout on
    // managed Postgres). With no listener, Node throws it as an uncaught
    // exception and the whole server crashes. Swallow it here — the next
    // query transparently opens a fresh connection.
    this.pool.on('error', (err: Error) => {
      process.stderr.write(`${JSON.stringify({ auditPoolError: err.message })}\n`);
    });
  }

  async write(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events
         (occurred_at, actor, tool, args_hash, status, latency_ms, trace_id, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.timestamp,
        event.actor,
        event.tool,
        event.argsHash,
        event.status,
        event.latencyMs,
        event.traceId,
        event.sessionId ?? null,
      ],
    );
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Fans out to all sinks; fails if any sink fails (audit is not best-effort). */
export class MultiSink implements AuditSink {
  constructor(private readonly sinks: AuditSink[]) {}

  async write(event: AuditEvent): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.write(event)));
  }
  async ping(): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.ping()));
  }
  async close(): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.close()));
  }
}

/** Test double. */
export class InMemorySink implements AuditSink {
  readonly events: AuditEvent[] = [];
  async write(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
}
