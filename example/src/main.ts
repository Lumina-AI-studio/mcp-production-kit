import { buildAuthContext } from '../../src/auth/index.js';
import {
  MultiSink,
  PostgresAuditSink,
  StdoutJsonSink,
  type AuditSink,
} from '../../src/audit/sink.js';
import { loadConfig } from '../../src/config.js';
import { rateLimiterFromConfig } from '../../src/rate-limit/index.js';
import { createApp } from '../../src/server.js';
import { ToolRegistry } from '../../src/tools/index.js';
import { getServiceStatus } from '../../src/tools/status.js';
import { SERVER_NAME, SERVER_VERSION } from '../../src/version.js';
import { PoolDb } from './db.js';
import { exampleTools } from './tools/index.js';

// Example bootstrap: the built-in smoke-test tool plus the five Nordwind demo
// tools, wired to a Postgres-backed Db. Mirrors src/main.ts; the only
// additions are the domain DB (EXAMPLE_DATABASE_URL) and tool set.

const db = PoolDb.fromEnv(); // throws fast if EXAMPLE_DATABASE_URL is missing

const registry = new ToolRegistry();
registry.register(getServiceStatus);
for (const tool of exampleTools(db)) {
  registry.register(tool);
}

const config = loadConfig();

const sinks: AuditSink[] = [new StdoutJsonSink()];
if (config.auditDatabaseUrl) {
  sinks.push(new PostgresAuditSink(config.auditDatabaseUrl));
} else {
  process.stderr.write(
    'AUDIT_DATABASE_URL not set — audit events go to stdout only. Do not run production like this.\n',
  );
}
const sink = new MultiSink(sinks);

const auth = await buildAuthContext(config);
if (auth) {
  process.stderr.write(
    `OAuth 2.1 resource server enabled: issuer=${config.authIssuer} resource=${config.resourceUrl}\n`,
  );
} else {
  process.stderr.write(
    'AUTH_ISSUER not set — running UNPROTECTED in dev mode with DEV_GRANTED_SCOPES. Never expose this to a network.\n',
  );
}

const rateLimiter = config.rateLimitEnabled ? rateLimiterFromConfig(config) : undefined;

const { app, closeSessions } = createApp({ registry, sink, config, auth, rateLimiter });

const httpServer = app.listen(config.port, config.host, () => {
  process.stderr.write(
    `${SERVER_NAME} ${SERVER_VERSION} (example) listening on http://${config.host}:${config.port}/mcp\n`,
  );
});

async function shutdown(signal: string): Promise<void> {
  process.stderr.write(`${signal} received, shutting down…\n`);
  httpServer.close();
  await closeSessions();
  await sink.close();
  await db.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
