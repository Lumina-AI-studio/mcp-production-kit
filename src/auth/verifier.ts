import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/**
 * JWT access-token verification per MCP auth spec 2025-11-25
 * (docs/mcp-authorization-spec-summary.md):
 *
 * - signature via the AS's JWKS
 * - issuer must match exactly
 * - audience binding is a MUST: the token's `aud` must contain THIS server's
 *   canonical resource URI (RFC 8707 / RFC 9068) — tokens minted for other
 *   resources are rejected, and we never forward inbound tokens upstream.
 *
 * Scope extraction handles both conventions: `scope` (space-separated
 * string, Keycloak/RFC 8693) and `scp` (array, Auth0/Entra).
 */
export interface VerifierOptions {
  issuer: string;
  /** Canonical URI of this MCP server — the required token audience. */
  audience: string;
  /** jose key source: createRemoteJWKSet(url) in prod, local set in tests. */
  keySource: JWTVerifyGetKey;
}

export class JwksTokenVerifier implements OAuthTokenVerifier {
  constructor(private readonly options: VerifierOptions) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.options.keySource, {
        issuer: this.options.issuer,
        audience: this.options.audience,
      }));
    } catch (error) {
      throw new InvalidTokenError(
        `Token validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const clientId =
      stringClaim(payload, 'azp') ?? stringClaim(payload, 'client_id') ?? 'unknown-client';

    const authInfo: AuthInfo = {
      token,
      clientId,
      scopes: extractScopes(payload),
      resource: new URL(this.options.audience),
      extra: { sub: payload.sub },
    };
    if (typeof payload.exp === 'number') {
      authInfo.expiresAt = payload.exp;
    }
    return authInfo;
  }
}

export function extractScopes(payload: JWTPayload): string[] {
  if (typeof payload['scope'] === 'string') {
    return payload['scope'].split(' ').filter(Boolean);
  }
  const scp = payload['scp'];
  if (Array.isArray(scp)) {
    return scp.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

function stringClaim(payload: JWTPayload, claim: string): string | undefined {
  const value = payload[claim];
  return typeof value === 'string' ? value : undefined;
}
