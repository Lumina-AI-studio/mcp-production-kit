import { describe, expect, it } from 'vitest';
import { isToolAllowed, type ScopeMap } from '../src/rbac/index.js';

const scopeMap: ScopeMap = {
  list_invoices: ['invoices:read'],
  create_refund_request: ['invoices:read', 'refunds:write'],
  broken_tool_without_scopes: [],
};

describe('RBAC deny-by-default', () => {
  it('denies tools with no scope mapping', () => {
    expect(isToolAllowed(scopeMap, 'unmapped_tool', ['invoices:read'])).toBe(false);
  });

  it('denies tools mapped to an empty scope list', () => {
    expect(isToolAllowed(scopeMap, 'broken_tool_without_scopes', ['invoices:read'])).toBe(false);
  });

  it('denies callers missing any required scope', () => {
    expect(isToolAllowed(scopeMap, 'create_refund_request', ['invoices:read'])).toBe(false);
  });

  it('denies callers with no scopes at all', () => {
    expect(isToolAllowed(scopeMap, 'list_invoices', [])).toBe(false);
  });

  it('allows callers holding every required scope', () => {
    expect(
      isToolAllowed(scopeMap, 'create_refund_request', ['invoices:read', 'refunds:write']),
    ).toBe(true);
  });
});
