/**
 * Per-tool RBAC: scope → tool mapping, deny-by-default.
 *
 * A tool with no entry in the scope map cannot be called by anyone.
 * A tool with an empty scope list cannot be called by anyone.
 * A caller must hold every scope the tool requires.
 */

import type { ToolDefinition } from '../tools/index.js';

export type Scope = string;

export type ScopeMap = Readonly<Record<string, readonly Scope[]>>;

/**
 * The scope map is derived from tool definitions — `requiredScopes` on the
 * tool is the single source of truth, so a tool cannot exist without its
 * mapping (hard rule: never ship a tool without a scope mapping).
 */
export function scopeMapFromTools(tools: readonly ToolDefinition[]): ScopeMap {
  return Object.fromEntries(tools.map((t) => [t.name, t.requiredScopes]));
}

export function isToolAllowed(
  scopeMap: ScopeMap,
  toolName: string,
  grantedScopes: readonly Scope[],
): boolean {
  const required = scopeMap[toolName];
  if (required === undefined || required.length === 0) {
    return false; // deny-by-default: unmapped tools are never callable
  }
  return required.every((scope) => grantedScopes.includes(scope));
}
