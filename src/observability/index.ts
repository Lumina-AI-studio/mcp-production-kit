import { randomUUID } from 'node:crypto';
import { SERVER_NAME, SERVER_VERSION } from '../version.js';

/**
 * M1 scope: trace ids + health payloads. Full OpenTelemetry traces/metrics
 * land later; the trace id emitted here is already propagated into every
 * audit event so correlation works from day one.
 */

export function newTraceId(): string {
  return randomUUID();
}

export interface HealthPayload {
  status: 'ok';
  name: string;
  version: string;
  uptimeSeconds: number;
}

export function healthPayload(): HealthPayload {
  return {
    status: 'ok',
    name: SERVER_NAME,
    version: SERVER_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
  };
}
