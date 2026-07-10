import { z } from 'zod';
import type { ToolDefinition } from '../../src/tools/index.js';

/**
 * Tool-selection eval harness: "given prompt X, does the agent select tool
 * Y?" This validates that tool names/descriptions/schemas steer an LLM
 * correctly — it is not a functional/integration test of the tools
 * themselves (handlers are never invoked).
 */

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT =
  'You are an operations assistant for Nordwind, a B2B e-commerce SaaS; use tools when appropriate.';

export interface EvalCase {
  prompt: string;
  /** Name of the tool the model should call, or null if it should call no tool. */
  expectTool: string | null;
  note?: string;
}

export interface RunEvalOpts {
  model?: string;
  apiKey?: string;
}

export interface EvalResult {
  case: EvalCase;
  /** Name of the first tool the model called, or null if it called none. */
  calledTool: string | null;
  pass: boolean;
  stopReason: string | null;
}

export interface EvalSummary {
  passed: number;
  failed: number;
  results: EvalResult[];
}

interface AnthropicToolSpec {
  name: string;
  description: string;
  input_schema: unknown;
}

interface AnthropicContentBlock {
  type: string;
  name?: string;
}

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
  stop_reason: string | null;
}

/** Maps a ToolDefinition's zod schema into the Anthropic tool-spec shape. */
export function toAnthropicTool(tool: ToolDefinition): AnthropicToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.inputSchema),
  };
}

/** Picks the first `tool_use` block's tool name out of a Messages response, if any. */
export function firstCalledTool(response: AnthropicMessagesResponse): string | null {
  const block = response.content.find((b) => b.type === 'tool_use');
  return block?.name ?? null;
}

export function classifyResult(calledTool: string | null, evalCase: EvalCase): boolean {
  return calledTool === evalCase.expectTool;
}

export async function runEvalCase(
  tools: ToolDefinition[],
  evalCase: EvalCase,
  opts: RunEvalOpts = {},
): Promise<EvalResult> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required to run eval cases');
  }
  const model = opts.model ?? process.env.EVAL_MODEL ?? DEFAULT_MODEL;

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      tool_choice: { type: 'auto' },
      tools: tools.map(toAnthropicTool),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: evalCase.prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic Messages API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as AnthropicMessagesResponse;
  const calledTool = firstCalledTool(data);

  return {
    case: evalCase,
    calledTool,
    pass: classifyResult(calledTool, evalCase),
    stopReason: data.stop_reason,
  };
}

export async function runEvals(
  tools: ToolDefinition[],
  cases: EvalCase[],
  opts: RunEvalOpts = {},
): Promise<EvalSummary> {
  const results: EvalResult[] = [];

  // Sequential: rate-limit friendly.
  for (const evalCase of cases) {
    const result = await runEvalCase(tools, evalCase, opts);
    results.push(result);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  printResultsTable(results);

  return { passed, failed, results };
}

function printResultsTable(results: EvalResult[]): void {
  const rows = results.map((r) => ({
    status: r.pass ? 'PASS' : 'FAIL',
    prompt: truncate(r.case.prompt, 50),
    expected: r.case.expectTool ?? '(none)',
    called: r.calledTool ?? '(none)',
    stopReason: r.stopReason ?? '',
  }));

  console.table(rows);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
