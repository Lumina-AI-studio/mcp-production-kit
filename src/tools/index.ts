import type { ZodType } from 'zod';

/**
 * Tool registry.
 *
 * Design rules (docs/tool-design.md):
 * - Tools are task-oriented verbs (`create_refund_request`), not CRUD dumps.
 * - Read-only by default; write tools must set `readOnly: false` explicitly
 *   and declare a confirmation payload in their schema.
 * - No tool ships without a scope mapping (src/rbac).
 */
export interface ToolDefinition<Args = unknown> {
  name: string;
  description: string;
  inputSchema: ZodType<Args>;
  /** Write tools must opt out explicitly. */
  readOnly: boolean;
  /** Scopes required to call this tool. Empty array = nobody can call it. */
  requiredScopes: string[];
}

const registry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (registry.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }
  registry.set(tool.name, tool);
}

export function listTools(): ToolDefinition[] {
  return [...registry.values()];
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}
