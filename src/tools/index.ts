import type { ZodObject, ZodRawShape, output } from 'zod';

/**
 * Tool registry.
 *
 * Design rules (docs/tool-design.md):
 * - Tools are task-oriented verbs (`create_refund_request`), not CRUD dumps.
 * - Read-only by default; write tools must set `readOnly: false` explicitly
 *   and declare a confirmation payload in their schema.
 * - No tool ships without a scope mapping (src/rbac).
 */

export interface ToolContext {
  /** Caller identity. `anonymous` until OAuth lands in M2. */
  actor: string;
  traceId: string;
  sessionId?: string | undefined;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodObject<ZodRawShape>;
  /** Write tools must opt out explicitly. */
  readOnly: boolean;
  /** Scopes required to call this tool. Empty array = nobody can call it. */
  requiredScopes: string[];
  /** Returns a JSON-serializable result; thrown errors become audit `error`. */
  handler: (args: unknown, ctx: ToolContext) => Promise<unknown>;
}

/**
 * Typed authoring helper: `handler` receives the schema's output type. The
 * cast below is the single place where that link is erased for storage.
 */
export function defineTool<Shape extends ZodRawShape>(def: {
  name: string;
  description: string;
  inputSchema: ZodObject<Shape>;
  readOnly: boolean;
  requiredScopes: string[];
  handler: (args: output<ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
}): ToolDefinition {
  return def as unknown as ToolDefinition;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}

export const defaultRegistry = new ToolRegistry();

export function registerTool(tool: ToolDefinition): void {
  defaultRegistry.register(tool);
}

export function listTools(): ToolDefinition[] {
  return defaultRegistry.list();
}

export function getTool(name: string): ToolDefinition | undefined {
  return defaultRegistry.get(name);
}
