import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, ToolRegistry } from '../src/tools/index.js';

const makeTool = (name: string) =>
  defineTool({
    name,
    description: 'List invoices for the authenticated account.',
    inputSchema: z.object({ limit: z.number().int().positive().max(100) }),
    readOnly: true,
    requiredScopes: ['invoices:read'],
    handler: async (args) => ({ invoices: [], limit: args.limit }),
  });

describe('tool registry', () => {
  it('registers and lists tools with zod schemas and scope mappings', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('list_invoices'));

    expect(registry.list().map((t) => t.name)).toEqual(['list_invoices']);
    expect(registry.get('list_invoices')?.readOnly).toBe(true);
    expect(registry.get('list_invoices')?.requiredScopes).toEqual(['invoices:read']);
  });

  it('rejects duplicate registrations', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('dup_tool'));
    expect(() => registry.register(makeTool('dup_tool'))).toThrow(/already registered/);
  });

  it('defineTool passes schema-typed args through to the handler', async () => {
    const tool = makeTool('typed_tool');
    await expect(
      tool.handler({ limit: 5 }, { actor: 'test', traceId: 't-1' }),
    ).resolves.toEqual({ invoices: [], limit: 5 });
  });
});
