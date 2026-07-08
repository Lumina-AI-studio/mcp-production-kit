import { buildAuthContext } from './auth/index.js';
import { MultiSink, PostgresAuditSink, StdoutJsonSink, type AuditSink } from './audit/sink.js';
import { loadConfig } from './config.js';
import { createApp } from './server.js';
import { defaultRegistry, registerTool } from './tools/index.js';
import { getServiceStatus } from './tools/status.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

registerTool(getServiceStatus);

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

const { app, closeSessions } = createApp({ registry: defaultRegistry, sink, config, auth });

const httpServer = app.listen(config.port, config.host, () => {
  process.stderr.write(
    `${SERVER_NAME} ${SERVER_VERSION} listening on http://${config.host}:${config.port}/mcp\n`,
  );
});

async function shutdown(signal: string): Promise<void> {
  process.stderr.write(`${signal} received, shutting down…\n`);
  httpServer.close();
  await closeSessions();
  await sink.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
