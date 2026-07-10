import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { executeTool } from '../src/audit/execute.js';
import { InMemorySink } from '../src/audit/sink.js';
import { RateLimiter } from '../src/rate-limit/index.js';
import { scopeMapFromTools } from '../src/rbac/index.js';
import { defineTool } from '../src/tools/index.js';

const readTool = defineTool({
  name: 'read_task',
  description: 'x',
  inputSchema: z.object({}),
  readOnly: true,
  requiredScopes: ['task:read'],
  handler: async () => ({ ok: true }),
});

const writeTool = defineTool({
  name: 'write_task',
  description: 'x',
  inputSchema: z.object({}),
  readOnly: false,
  requiredScopes: ['task:write'],
  handler: async () => ({ ok: true }),
});

describe('RateLimiter bucket math', () => {
  it('allows bursts up to capacity, then denies with a sensible retryAfterSeconds', () => {
    const now = 0;
    const limiter = new RateLimiter({ readPerMinute: 3, writePerMinute: 1, now: () => now });

    expect(limiter.check('actor-a', readTool)).toEqual({ allowed: true });
    expect(limiter.check('actor-a', readTool)).toEqual({ allowed: true });
    expect(limiter.check('actor-a', readTool)).toEqual({ allowed: true });

    const denied = limiter.check('actor-a', readTool);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    // 3/min => 1 token per 20s; denied with 0 tokens needs ~20s.
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(20);
  });

  it('refills over time', () => {
    let now = 0;
    const limiter = new RateLimiter({ readPerMinute: 60, writePerMinute: 1, now: () => now });

    // Drain the bucket (60/min = 1/sec).
    for (let i = 0; i < 60; i++) {
      expect(limiter.check('actor-a', readTool).allowed).toBe(true);
    }
    expect(limiter.check('actor-a', readTool).allowed).toBe(false);

    // Advance 1 second — exactly one token refilled.
    now += 1000;
    expect(limiter.check('actor-a', readTool).allowed).toBe(true);
    expect(limiter.check('actor-a', readTool).allowed).toBe(false);
  });

  it('gives write tools a stricter limit than read tools', () => {
    const now = 0;
    const limiter = new RateLimiter({ readPerMinute: 5, writePerMinute: 2, now: () => now });

    expect(limiter.check('actor-a', writeTool)).toEqual({ allowed: true });
    expect(limiter.check('actor-a', writeTool)).toEqual({ allowed: true });
    expect(limiter.check('actor-a', writeTool).allowed).toBe(false);

    // Read tool for the same actor is unaffected (different bucket key).
    expect(limiter.check('actor-a', readTool).allowed).toBe(true);
  });

  it('isolates buckets per actor', () => {
    const now = 0;
    const limiter = new RateLimiter({ readPerMinute: 1, writePerMinute: 1, now: () => now });

    expect(limiter.check('actor-a', readTool).allowed).toBe(true);
    expect(limiter.check('actor-a', readTool).allowed).toBe(false);

    // actor-b has its own bucket, unaffected by actor-a's exhaustion.
    expect(limiter.check('actor-b', readTool).allowed).toBe(true);
  });
});

describe('rate limiting via executeTool', () => {
  const scopeMap = scopeMapFromTools([readTool, writeTool]);
  const ctx = { actor: 'test-actor', traceId: 'trace-1', sessionId: 'sess-1' };

  it('emits a rate_limited audit event with a rate-limit error message when the limit is hit', async () => {
    const now = 0;
    const sink = new InMemorySink();
    const rateLimiter = new RateLimiter({ readPerMinute: 1, writePerMinute: 1, now: () => now });

    const first = await executeTool(readTool, {}, ctx, ['task:read'], {
      scopeMap,
      sink,
      rateLimiter,
    });
    expect(first.ok).toBe(true);

    const second = await executeTool(readTool, {}, ctx, ['task:read'], {
      scopeMap,
      sink,
      rateLimiter,
    });
    expect(second.ok).toBe(false);
    expect(second.errorMessage).toMatch(/rate limit/i);

    expect(sink.events.map((e) => e.status)).toEqual(['ok', 'rate_limited']);
  });

  it('scope denial still wins over rate limiting and does not consume budget', async () => {
    const now = 0;
    const sink = new InMemorySink();
    const rateLimiter = new RateLimiter({ readPerMinute: 1, writePerMinute: 1, now: () => now });

    // Caller lacks the scope — exhaust several attempts, all denied for scope,
    // never for rate limit, and no budget should have been consumed.
    for (let i = 0; i < 5; i++) {
      const outcome = await executeTool(readTool, {}, ctx, [], { scopeMap, sink, rateLimiter });
      expect(outcome.ok).toBe(false);
      expect(outcome.errorMessage).toMatch(/insufficient scope/i);
    }

    // Now call with the proper scope — should still succeed because the
    // rate-limit budget was never touched by the scope-denied calls.
    const outcome = await executeTool(readTool, {}, ctx, ['task:read'], {
      scopeMap,
      sink,
      rateLimiter,
    });
    expect(outcome.ok).toBe(true);

    expect(sink.events.map((e) => e.status)).toEqual([
      'denied',
      'denied',
      'denied',
      'denied',
      'denied',
      'ok',
    ]);
  });

  it('isolates rate limits per actor through executeTool', async () => {
    const now = 0;
    const sink = new InMemorySink();
    const rateLimiter = new RateLimiter({ readPerMinute: 1, writePerMinute: 1, now: () => now });

    const ctxA = { actor: 'actor-a', traceId: 't1', sessionId: 's1' };
    const ctxB = { actor: 'actor-b', traceId: 't2', sessionId: 's2' };

    const a1 = await executeTool(readTool, {}, ctxA, ['task:read'], { scopeMap, sink, rateLimiter });
    expect(a1.ok).toBe(true);
    const a2 = await executeTool(readTool, {}, ctxA, ['task:read'], { scopeMap, sink, rateLimiter });
    expect(a2.ok).toBe(false);

    // actor-b is unaffected by actor-a's exhausted bucket.
    const b1 = await executeTool(readTool, {}, ctxB, ['task:read'], { scopeMap, sink, rateLimiter });
    expect(b1.ok).toBe(true);
  });
});
