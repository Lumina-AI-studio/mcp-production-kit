/**
 * Per-tool RBAC: scope → tool mapping, deny-by-default.
 *
 * A tool with no entry in the scope map cannot be called by anyone.
 * A tool with an empty scope list cannot be called by anyone.
 * A caller must hold every scope the tool requires.
 */

export type Scope = string;

export type ScopeMap = Readonly<Record<string, readonly Scope[]>>;

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
