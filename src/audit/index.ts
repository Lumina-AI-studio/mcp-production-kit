import { createHash } from 'node:crypto';

/**
 * Structured audit events. Every tool call MUST produce one (CLAUDE.md hard
 * rule). The sink is append-only; M1 adds the Postgres/Supabase + stdout
 * JSON writers. Args are hashed, never stored raw (GDPR: PII stays out of
 * the audit trail; redaction hooks come with the sink implementation).
 */
export interface AuditEvent {
  timestamp: string;
  actor: string;
  tool: string;
  argsHash: string;
  status: 'ok' | 'error' | 'denied';
  latencyMs: number;
  traceId: string;
}

/** Deterministic SHA-256 over canonicalized (key-sorted) JSON args. */
export function hashArgs(args: unknown): string {
  return createHash('sha256').update(canonicalize(args)).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(',')}}`;
}
