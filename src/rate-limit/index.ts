import type { ToolDefinition } from '../tools/index.js';

/**
 * Per-client + per-tool rate limiting (M3).
 *
 * In-memory continuous-refill token bucket, keyed by `${actor} ${tool.name}`.
 * Write tools (readOnly: false) get the stricter of the two configured
 * per-minute limits. This is a single-process limiter — fine for the
 * template's default deployment (see CLAUDE.md: no gateway, no
 * multi-tenancy); swap in a shared store if you scale out.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Present when denied. Seconds until at least one token is available. */
  retryAfterSeconds?: number;
}

export interface RateLimiterOptions {
  /** Requests per minute allowed for read-only tools. */
  readPerMinute: number;
  /** Requests per minute allowed for write (readOnly: false) tools. */
  writePerMinute: number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Prune a bucket if idle longer than this, in ms. Default 10 minutes. */
  idlePruneMs?: number;
  /** Hard cap on tracked buckets to bound memory. Default 50,000. */
  maxBuckets?: number;
}

interface Bucket {
  tokens: number;
  capacity: number;
  refillPerMs: number;
  lastRefillAt: number;
  lastAccessAt: number;
}

export class RateLimiter {
  private readonly readPerMinute: number;
  private readonly writePerMinute: number;
  private readonly now: () => number;
  private readonly idlePruneMs: number;
  private readonly maxBuckets: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions) {
    this.readPerMinute = options.readPerMinute;
    this.writePerMinute = options.writePerMinute;
    this.now = options.now ?? (() => Date.now());
    this.idlePruneMs = options.idlePruneMs ?? 10 * 60 * 1000;
    this.maxBuckets = options.maxBuckets ?? 50_000;
  }

  check(actor: string, tool: ToolDefinition): RateLimitResult {
    const limitPerMinute = tool.readOnly ? this.readPerMinute : this.writePerMinute;
    const key = `${actor} ${tool.name}`;
    const nowMs = this.now();

    this.pruneIfNeeded(nowMs);

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.capacity !== limitPerMinute) {
      // Capacity mismatch (e.g. config changed) — start fresh, full bucket.
      bucket = {
        tokens: limitPerMinute,
        capacity: limitPerMinute,
        refillPerMs: limitPerMinute / 60_000,
        lastRefillAt: nowMs,
        lastAccessAt: nowMs,
      };
      this.buckets.set(key, bucket);
    } else {
      this.refill(bucket, nowMs);
    }

    bucket.lastAccessAt = nowMs;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    const tokensNeeded = 1 - bucket.tokens;
    const retryAfterSeconds =
      bucket.refillPerMs > 0 ? Math.ceil(tokensNeeded / bucket.refillPerMs / 1000) : Infinity;
    return { allowed: false, retryAfterSeconds };
  }

  private refill(bucket: Bucket, nowMs: number): void {
    const elapsedMs = nowMs - bucket.lastRefillAt;
    if (elapsedMs <= 0) return;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedMs * bucket.refillPerMs);
    bucket.lastRefillAt = nowMs;
  }

  /** Lazily prune idle buckets on check, bounded by a size cap. */
  private pruneIfNeeded(nowMs: number): void {
    if (this.buckets.size < this.maxBuckets) {
      // Cheap path: only sweep idle entries once we're near the cap, so
      // normal checks stay O(1).
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.lastAccessAt > this.idlePruneMs) {
        this.buckets.delete(key);
      }
    }
  }
}

export interface RateLimiterConfigSource {
  rateLimitReadPerMinute: number;
  rateLimitWritePerMinute: number;
}

/** Build a RateLimiter from Config values. */
export function rateLimiterFromConfig(config: RateLimiterConfigSource): RateLimiter {
  return new RateLimiter({
    readPerMinute: config.rateLimitReadPerMinute,
    writePerMinute: config.rateLimitWritePerMinute,
  });
}
