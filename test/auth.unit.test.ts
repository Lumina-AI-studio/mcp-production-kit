import { describe, expect, it } from 'vitest';
import { discoveryUrls } from '../src/auth/discovery.js';
import { extractScopes } from '../src/auth/verifier.js';

describe('AS metadata discovery URL order (per MCP spec 2025-11-25)', () => {
  it('path issuers: RFC 8414 path-insertion, OIDC path-insertion, OIDC path-append', () => {
    expect(discoveryUrls('https://auth.example.com/realms/mcp')).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server/realms/mcp',
      'https://auth.example.com/.well-known/openid-configuration/realms/mcp',
      'https://auth.example.com/realms/mcp/.well-known/openid-configuration',
    ]);
  });

  it('root issuers: RFC 8414 then OIDC', () => {
    expect(discoveryUrls('https://auth.example.com')).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server',
      'https://auth.example.com/.well-known/openid-configuration',
    ]);
  });
});

describe('scope extraction', () => {
  it('parses space-separated scope claim (Keycloak style)', () => {
    expect(extractScopes({ scope: 'status:read refunds:write' })).toEqual([
      'status:read',
      'refunds:write',
    ]);
  });

  it('parses scp array claim (Auth0/Entra style)', () => {
    expect(extractScopes({ scp: ['status:read', 'refunds:write'] })).toEqual([
      'status:read',
      'refunds:write',
    ]);
  });

  it('yields no scopes when neither claim is present (deny-by-default downstream)', () => {
    expect(extractScopes({})).toEqual([]);
  });
});
