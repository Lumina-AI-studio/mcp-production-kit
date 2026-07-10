import { z } from 'zod';

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  /** Bind address. Keep 127.0.0.1 outside containers; 0.0.0.0 in Docker. */
  HOST: z.string().default('127.0.0.1'),
  /**
   * Postgres/Supabase connection string for the audit sink. When unset, audit
   * events go to stdout JSON only (fine for local dev, not for production).
   */
  AUDIT_DATABASE_URL: z.string().optional(),
  /**
   * Scopes granted to unauthenticated callers, comma-separated. M1-only
   * development escape hatch — empty by default (deny everything), replaced
   * by real token scopes in M2. Never set this in production.
   */
  DEV_GRANTED_SCOPES: z.string().default(''),
  /**
   * Host headers accepted by the Streamable HTTP transport (DNS-rebinding
   * protection). Comma-separated, including port where applicable, e.g.
   * "mcp.example.com,127.0.0.1:3000". Defaults to localhost forms.
   */
  MCP_ALLOWED_HOSTS: z.string().optional(),
  /**
   * OAuth 2.1 authorization server issuer URL (e.g. the Keycloak realm URL).
   * Setting this turns the server into a protected resource: Bearer tokens
   * required on /mcp, RFC 9728 metadata served, DEV_GRANTED_SCOPES ignored.
   */
  AUTH_ISSUER: z.string().url().optional(),
  /**
   * Canonical URI of THIS server (RFC 8707 resource identifier), e.g.
   * "https://mcp.example.com/mcp". Required with AUTH_ISSUER; tokens must
   * carry it as audience. Lowercase scheme/host, no fragment, no trailing /.
   */
  MCP_RESOURCE_URL: z.string().url().optional(),
  /**
   * Override the JWKS URL (defaults to jwks_uri from AS discovery). When
   * set, it is used verbatim — it must already be reachable from this
   * process (no AUTH_INTERNAL_ISSUER_URL rewriting is applied to it).
   */
  AUTH_JWKS_URL: z.string().url().optional(),
  /**
   * Base URL for reaching the authorization server over an internal network
   * when it differs from the public issuer (e.g. issuer is
   * "http://localhost:8080/realms/x" for clients, but this container reaches
   * Keycloak at "http://keycloak:8080/realms/x"). Discovery and JWKS are
   * fetched via this base; token `iss` is still validated against
   * AUTH_ISSUER. The internal hop is only as trustworthy as the network it
   * crosses: keep it on a private/trusted network and prefer TLS — a MITM
   * on this hop could serve a forged discovery document.
   */
  AUTH_INTERNAL_ISSUER_URL: z.string().url().optional(),
  /** Requests per minute allowed for read-only tools, per (actor, tool). */
  RATE_LIMIT_READ_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /** Requests per minute allowed for write tools, per (actor, tool). */
  RATE_LIMIT_WRITE_PER_MINUTE: z.coerce.number().int().positive().default(20),
  /** Set to 'false' to disable rate limiting entirely. */
  RATE_LIMIT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
});

export interface Config {
  port: number;
  host: string;
  auditDatabaseUrl: string | undefined;
  devGrantedScopes: string[];
  allowedHosts: string[];
  authIssuer: string | undefined;
  resourceUrl: string | undefined;
  authJwksUrl: string | undefined;
  authInternalIssuerUrl: string | undefined;
  rateLimitReadPerMinute: number;
  rateLimitWritePerMinute: number;
  rateLimitEnabled: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    auditDatabaseUrl: parsed.AUDIT_DATABASE_URL,
    devGrantedScopes: csv(parsed.DEV_GRANTED_SCOPES),
    allowedHosts: parsed.MCP_ALLOWED_HOSTS
      ? csv(parsed.MCP_ALLOWED_HOSTS)
      : ['127.0.0.1', 'localhost', `127.0.0.1:${parsed.PORT}`, `localhost:${parsed.PORT}`],
    authIssuer: parsed.AUTH_ISSUER,
    resourceUrl: parsed.MCP_RESOURCE_URL,
    authJwksUrl: parsed.AUTH_JWKS_URL,
    authInternalIssuerUrl: parsed.AUTH_INTERNAL_ISSUER_URL,
    rateLimitReadPerMinute: parsed.RATE_LIMIT_READ_PER_MINUTE,
    rateLimitWritePerMinute: parsed.RATE_LIMIT_WRITE_PER_MINUTE,
    rateLimitEnabled: parsed.RATE_LIMIT_ENABLED,
  };
}
