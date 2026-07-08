import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createRemoteJWKSet } from 'jose';
import type { Config } from '../config.js';
import { discoverAuthServerMetadata, toOAuthMetadata } from './discovery.js';
import { JwksTokenVerifier } from './verifier.js';

/**
 * OAuth 2.1 resource-server context. Built once at startup when AUTH_ISSUER
 * is configured; absent = dev mode (DEV_GRANTED_SCOPES escape hatch, loud
 * warnings, never production).
 */
export interface AuthContext {
  verifier: OAuthTokenVerifier;
  oauthMetadata: OAuthMetadata;
  /** Canonical URI of this server — PRM `resource` and token audience. */
  resourceServerUrl: URL;
}

export async function buildAuthContext(config: Config): Promise<AuthContext | undefined> {
  if (!config.authIssuer) return undefined;
  if (!config.resourceUrl) {
    throw new Error('MCP_RESOURCE_URL is required when AUTH_ISSUER is set (canonical server URI).');
  }

  const metadata = await discoverAuthServerMetadata(config.authIssuer);
  const jwksUrl = new URL(config.authJwksUrl ?? metadata.jwks_uri);

  return {
    verifier: new JwksTokenVerifier({
      issuer: config.authIssuer,
      audience: config.resourceUrl,
      keySource: createRemoteJWKSet(jwksUrl),
    }),
    oauthMetadata: toOAuthMetadata(metadata),
    resourceServerUrl: new URL(config.resourceUrl),
  };
}
