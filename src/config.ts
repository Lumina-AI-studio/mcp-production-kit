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
});

export interface Config {
  port: number;
  host: string;
  auditDatabaseUrl: string | undefined;
  devGrantedScopes: string[];
  allowedHosts: string[];
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
  };
}
