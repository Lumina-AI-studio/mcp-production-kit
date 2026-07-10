import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../src/tools/index.js';
import {
  classifyResult,
  firstCalledTool,
  runEvalCase,
  toAnthropicTool,
} from './harness.js';

const refundTool = defineTool({
  name: 'create_refund_request',
  description:
    'Create a refund request for an order. Requires an explicit confirmation payload restating amount and reason.',
  inputSchema: z.object({
    orderId: z.string(),
    confirm: z.object({
      amountCents: z.number(),
      reason: z.string(),
    }),
  }),
  readOnly: false,
  requiredScopes: ['refunds:write'],
  handler: async () => ({}),
});

const statusTool = defineTool({
  name: 'get_service_status',
  description: 'Report the MCP server health.',
  inputSchema: z.object({}),
  readOnly: true,
  requiredScopes: ['status:read'],
  handler: async () => ({}),
});

describe('toAnthropicTool', () => {
  it('maps name and description straight through', () => {
    const spec = toAnthropicTool(statusTool);
    expect(spec.name).toBe('get_service_status');
    expect(spec.description).toBe('Report the MCP server health.');
  });

  it('converts a nested zod object schema into the matching JSON schema shape', () => {
    const spec = toAnthropicTool(refundTool);
    const schema = spec.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['orderId', 'confirm']);
    expect(schema.properties['orderId']).toMatchObject({ type: 'string' });

    const confirm = schema.properties['confirm'] as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(confirm.type).toBe('object');
    expect(confirm.required).toEqual(['amountCents', 'reason']);
    expect(confirm.properties['amountCents']).toMatchObject({ type: 'number' });
    expect(confirm.properties['reason']).toMatchObject({ type: 'string' });
  });
});

describe('firstCalledTool', () => {
  it('returns the name of the first tool_use block', () => {
    const tool = firstCalledTool({
      stop_reason: 'tool_use',
      content: [
        { type: 'text' },
        { type: 'tool_use', name: 'create_refund_request' },
        { type: 'tool_use', name: 'cancel_order' },
      ],
    });
    expect(tool).toBe('create_refund_request');
  });

  it('returns null when there is no tool_use block', () => {
    const tool = firstCalledTool({
      stop_reason: 'end_turn',
      content: [{ type: 'text' }],
    });
    expect(tool).toBeNull();
  });

  it('returns null for an empty content array', () => {
    const tool = firstCalledTool({ stop_reason: 'end_turn', content: [] });
    expect(tool).toBeNull();
  });
});

describe('classifyResult', () => {
  it('passes when the called tool matches expectTool', () => {
    expect(
      classifyResult('create_refund_request', {
        prompt: 'refund it',
        expectTool: 'create_refund_request',
      }),
    ).toBe(true);
  });

  it('fails when the called tool does not match expectTool', () => {
    expect(
      classifyResult('cancel_order', {
        prompt: 'refund it',
        expectTool: 'create_refund_request',
      }),
    ).toBe(false);
  });

  it('passes when expectTool is null and no tool was called', () => {
    expect(classifyResult(null, { prompt: 'write a haiku', expectTool: null })).toBe(
      true,
    );
  });

  it('fails when expectTool is null but a tool was called', () => {
    expect(
      classifyResult('search_customers', { prompt: 'write a haiku', expectTool: null }),
    ).toBe(false);
  });
});

describe('runEvalCase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the Anthropic Messages API and reports a pass on a matching tool_use block', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', name: 'create_refund_request' }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runEvalCase(
      [refundTool],
      {
        prompt: 'refund order o_1 for 500 cents, damaged item',
        expectTool: 'create_refund_request',
      },
      { apiKey: 'test-key' },
    );

    expect(result.pass).toBe(true);
    expect(result.calledTool).toBe('create_refund_request');
    expect(result.stopReason).toBe('tool_use');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe(
      '2023-06-01',
    );

    const body = JSON.parse(init.body as string) as {
      tool_choice: { type: string };
      tools: { name: string }[];
      messages: { role: string; content: string }[];
    };
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.tools.map((t) => t.name)).toEqual(['create_refund_request']);
    expect(body.messages).toEqual([
      { role: 'user', content: 'refund order o_1 for 500 cents, damaged item' },
    ]);
  });

  it('reports a fail when the model calls no tool but one was expected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text' }] }),
          { status: 200 },
        ),
      ),
    );

    const result = await runEvalCase(
      [refundTool],
      { prompt: 'refund it', expectTool: 'create_refund_request' },
      { apiKey: 'test-key' },
    );

    expect(result.pass).toBe(false);
    expect(result.calledTool).toBeNull();
  });

  it('reports a pass for expectTool: null when the model calls no tool', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text' }] }),
          { status: 200 },
        ),
      ),
    );

    const result = await runEvalCase(
      [refundTool],
      { prompt: 'write me a haiku about invoices', expectTool: null },
      { apiKey: 'test-key' },
    );

    expect(result.pass).toBe(true);
    expect(result.calledTool).toBeNull();
  });

  it('throws when the API responds with a non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })),
    );

    await expect(
      runEvalCase(
        [refundTool],
        { prompt: 'refund it', expectTool: 'create_refund_request' },
        { apiKey: 'test-key' },
      ),
    ).rejects.toThrow(/400/);
  });

  it('throws when no API key is available', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(
      runEvalCase([refundTool], {
        prompt: 'refund it',
        expectTool: 'create_refund_request',
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);

    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });
});
