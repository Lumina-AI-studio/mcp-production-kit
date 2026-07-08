import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { executeTool } from '../src/audit/execute.js';
import { hashArgs } from '../src/audit/index.js';
import { InMemorySink, type AuditSink } from '../src/audit/sink.js';
import { scopeMapFromTools } from '../src/rbac/index.js';
import { defineTool } from '../src/tools/index.js';

const echoTool = defineTool({
  name: 'echo_task',
  description: 'x',
  inputSchema: z.object({ message: z.string() }),
  readOnly: true,
  requiredScopes: ['echo:read'],
  handler: async (args) => ({ echoed: args.message }),
});

const failingTool = defineTool({
  name: 'failing_task',
  description: 'x',
  inputSchema: z.object({}),
  readOnly: true,
  requiredScopes: ['echo:read'],
  handler: async () => {
    throw new Error('boom');
  },
});

const scopeMap = scopeMapFromTools([echoTool, failingTool]);
const ctx = { actor: 'test-actor', traceId: 'trace-123', sessionId: 'sess-1' };

describe('executeTool audit pipeline', () => {
  it('emits a complete audit event on success', async () => {
    const sink = new InMemorySink();
    const args = { message: 'hi' };
    const outcome = await executeTool(echoTool, args, ctx, ['echo:read'], { scopeMap, sink });

    expect(outcome).toEqual({ ok: true, result: { echoed: 'hi' } });
    expect(sink.events).toHaveLength(1);
    const event = sink.events[0]!;
    expect(event.actor).toBe('test-actor');
    expect(event.tool).toBe('echo_task');
    expect(event.argsHash).toBe(hashArgs(args));
    expect(event.status).toBe('ok');
    expect(event.latencyMs).toBeGreaterThanOrEqual(0);
    expect(event.traceId).toBe('trace-123');
    expect(event.sessionId).toBe('sess-1');
    expect(Date.parse(event.timestamp)).not.toBeNaN();
  });

  it('denies without required scope and still audits (status=denied)', async () => {
    const sink = new InMemorySink();
    const outcome = await executeTool(echoTool, { message: 'hi' }, ctx, [], { scopeMap, sink });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toMatch(/insufficient scope/i);
    expect(sink.events.map((e) => e.status)).toEqual(['denied']);
  });

  it('audits handler failures (status=error)', async () => {
    const sink = new InMemorySink();
    const outcome = await executeTool(failingTool, {}, ctx, ['echo:read'], { scopeMap, sink });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toMatch(/boom/);
    expect(sink.events.map((e) => e.status)).toEqual(['error']);
  });

  it('fails the call loudly when the audit sink is down', async () => {
    const brokenSink: AuditSink = {
      write: async () => {
        throw new Error('pg down');
      },
      ping: async () => {},
      close: async () => {},
    };
    const outcome = await executeTool(echoTool, { message: 'hi' }, ctx, ['echo:read'], {
      scopeMap,
      sink: brokenSink,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toMatch(/audit sink/i);
  });
});
