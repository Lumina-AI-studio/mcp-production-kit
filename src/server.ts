import { randomUUID } from 'node:crypto';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { type Express, type Request, type Response } from 'express';
import type { AuthContext } from './auth/index.js';
import { executeTool } from './audit/execute.js';
import type { AuditSink } from './audit/sink.js';
import type { Config } from './config.js';
import { healthPayload, newTraceId } from './observability/index.js';
import type { RateLimiter } from './rate-limit/index.js';
import { scopeMapFromTools } from './rbac/index.js';
import type { ToolRegistry } from './tools/index.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

export interface ServerDeps {
  registry: ToolRegistry;
  sink: AuditSink;
  config: Config;
  /** OAuth 2.1 resource-server context; absent = dev mode (M1 behavior). */
  auth?: AuthContext | undefined;
  /** Absent = rate limiting disabled. */
  rateLimiter?: RateLimiter | undefined;
}

/**
 * One McpServer per session. Every registered tool goes through
 * executeTool() — RBAC deny-by-default, then handler, then audit event.
 */
export function createMcpServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const scopeMap = scopeMapFromTools(deps.registry.list());

  for (const tool of deps.registry.list()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: tool.readOnly },
      },
      async (args: unknown, extra) => {
        // With auth on, identity/scopes come from the validated token only;
        // the dev escape hatch exists solely when no issuer is configured.
        const sub = extra.authInfo?.extra?.['sub'];
        const actor =
          (typeof sub === 'string' ? sub : undefined) ?? extra.authInfo?.clientId ?? 'anonymous';
        const grantedScopes =
          extra.authInfo?.scopes ?? (deps.auth ? [] : deps.config.devGrantedScopes);

        const outcome = await executeTool(
          tool,
          args,
          { actor, traceId: newTraceId(), sessionId: extra.sessionId },
          grantedScopes,
          { scopeMap, sink: deps.sink, rateLimiter: deps.rateLimiter },
        );

        if (!outcome.ok) {
          return {
            content: [{ type: 'text' as const, text: outcome.errorMessage ?? 'Tool call failed.' }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(outcome.result, null, 2) }],
        };
      },
    );
  }

  return server;
}

export interface RunningApp {
  app: Express;
  /** Close all live sessions (used by shutdown and tests). */
  closeSessions(): Promise<void>;
}

export function createApp(deps: ServerDeps): RunningApp {
  const app = express();
  app.use(express.json());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  if (deps.auth) {
    // RFC 9728 Protected Resource Metadata (+ mirrored AS metadata) at
    // /.well-known/…, and Bearer enforcement on the MCP endpoint. 401s carry
    // WWW-Authenticate with resource_metadata per spec; health stays open.
    const scopesSupported = [...new Set(deps.registry.list().flatMap((t) => t.requiredScopes))];
    app.use(
      mcpAuthMetadataRouter({
        oauthMetadata: deps.auth.oauthMetadata,
        resourceServerUrl: deps.auth.resourceServerUrl,
        scopesSupported,
        resourceName: SERVER_NAME,
      }),
    );
    app.use(
      '/mcp',
      requireBearerAuth({
        verifier: deps.auth.verifier,
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(deps.auth.resourceServerUrl),
      }),
    );
  }

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json(healthPayload());
  });

  app.get('/readyz', (_req: Request, res: Response) => {
    deps.sink
      .ping()
      .then(() => res.json({ status: 'ready' }))
      .catch((error: unknown) =>
        res.status(503).json({ status: 'not-ready', reason: String(error) }),
      );
  });

  app.post('/mcp', (req: Request, res: Response) => {
    void (async () => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const existing = sessionId ? transports.get(sessionId) : undefined;

      if (existing) {
        await existing.handleRequest(req, res, req.body);
        return;
      }
      if (sessionId) {
        res.status(404).json(jsonRpcError(-32001, 'Session not found'));
        return;
      }
      if (!isInitializeRequest(req.body)) {
        res.status(400).json(jsonRpcError(-32000, 'Bad request: expected initialize request'));
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
        },
        enableDnsRebindingProtection: true,
        allowedHosts: deps.config.allowedHosts,
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };

      await createMcpServer(deps).connect(transport);
      await transport.handleRequest(req, res, req.body);
    })().catch((error: unknown) => {
      if (!res.headersSent) {
        res.status(500).json(jsonRpcError(-32603, `Internal error: ${String(error)}`));
      }
    });
  });

  const handleSessionRequest = (req: Request, res: Response): void => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(sessionId ? 404 : 400).send('Missing or unknown mcp-session-id');
      return;
    }
    void transport.handleRequest(req, res).catch(() => {
      if (!res.headersSent) res.status(500).end();
    });
  };

  // GET = server→client SSE stream; DELETE = session termination.
  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  return {
    app,
    closeSessions: async () => {
      await Promise.all([...transports.values()].map((t) => t.close()));
      transports.clear();
    },
  };
}

function jsonRpcError(code: number, message: string): object {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}
