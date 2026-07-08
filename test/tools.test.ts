import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getTool, listTools, registerTool } from '../src/tools/index.js';

describe('tool registry', () => {
  it('registers and lists tools with zod schemas and scope mappings', () => {
    registerTool({
      name: 'list_invoices',
      description: 'List invoices for the authenticated account.',
      inputSchema: z.object({ limit: z.number().int().positive().max(100) }),
      readOnly: true,
      requiredScopes: ['invoices:read'],
    });

    expect(listTools().map((t) => t.name)).toContain('list_invoices');
    expect(getTool('list_invoices')?.readOnly).toBe(true);
  });

  it('rejects duplicate registrations', () => {
    const tool = {
      name: 'dup_tool',
      description: 'x',
      inputSchema: z.object({}),
      readOnly: true,
      requiredScopes: ['x:read'],
    };
    registerTool(tool);
    expect(() => registerTool(tool)).toThrow(/already registered/);
  });
});
