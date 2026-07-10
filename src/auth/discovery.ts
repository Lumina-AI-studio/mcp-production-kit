import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { z } from 'zod';

/**
 * Authorization-server metadata discovery (RFC 8414 + OIDC Discovery),
 * tried in the order the MCP spec prescribes for issuers without a path;
 * for issuers with a path (e.g. Keycloak realms) the path-aware forms are
 * included. We need this at startup to embed the AS metadata in our RFC 9728
 * protected-resource response and to locate the JWKS.
 */
const asMetadataSchema = z
  .object({
    issuer: z.string(),
    jwks_uri: z.string(),
    authorization_endpoint: z.string().optional(),
    token_endpoint: z.string().optional(),
    response_types_supported: z.array(z.string()).default(['code']),
    code_challenge_methods_supported: z.array(z.string()).optional(),
  })
  .loose();

export type AuthServerMetadata = z.infer<typeof asMetadataSchema>;

/** Swap the public issuer prefix for the internal base URL, if configured. */
export function toInternalUrl(
  publicUrl: string,
  issuer: string,
  internalIssuerUrl: string | undefined,
): string {
  if (!internalIssuerUrl || !publicUrl.startsWith(issuer)) return publicUrl;
  return internalIssuerUrl.replace(/\/$/, '') + publicUrl.slice(issuer.replace(/\/$/, '').length);
}

export function discoveryUrls(issuer: string): string[] {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/$/, '');
  const origin = url.origin;
  if (path && path !== '') {
    return [
      `${origin}/.well-known/oauth-authorization-server${path}`,
      `${origin}/.well-known/openid-configuration${path}`,
      `${origin}${path}/.well-known/openid-configuration`,
    ];
  }
  return [
    `${origin}/.well-known/oauth-authorization-server`,
    `${origin}/.well-known/openid-configuration`,
  ];
}

export async function discoverAuthServerMetadata(
  issuer: string,
  internalIssuerUrl?: string,
): Promise<AuthServerMetadata> {
  const attempts: string[] = [];
  for (const publicUrl of discoveryUrls(issuer)) {
    const url = toInternalUrl(publicUrl, issuer, internalIssuerUrl);
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) {
        attempts.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      const metadata = asMetadataSchema.parse(await res.json());
      if (metadata.issuer !== issuer) {
        throw new Error(
          `Issuer mismatch: discovery document says "${metadata.issuer}", configured "${issuer}"`,
        );
      }
      if (!metadata.code_challenge_methods_supported?.includes('S256')) {
        // MCP clients MUST refuse an AS without PKCE support — surface early.
        process.stderr.write(
          `WARNING: ${issuer} does not advertise code_challenge_methods_supported with S256; MCP clients will refuse it.\n`,
        );
      }
      return metadata;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Issuer mismatch')) throw error;
      attempts.push(`${url} → ${String(error)}`);
    }
  }
  throw new Error(`Authorization server metadata discovery failed:\n  ${attempts.join('\n  ')}`);
}

/** Shape the SDK's metadata router expects. */
export function toOAuthMetadata(metadata: AuthServerMetadata): OAuthMetadata {
  return metadata as unknown as OAuthMetadata;
}
