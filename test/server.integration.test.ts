import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemorySink } from '../src/audit/sink.js';
import type { Config } from '../src/config.js';
import { createApp, type RunningApp } from '../src/server.js';
import { ToolRegistry } from '../src/tools/index.js';
import { getServiceStatus } from '../src/tools/status.js';

describe('Streamable HTTP server (end-to-end via SDK client)', () => {
  const sink = new InMemorySink();
  const registry = new ToolRegistry();
  registry.register(getServiceStatus);

  const config: Config = {
    port: 0,
    host: '127.0.0.1',
    auditDatabaseUrl: undefined,
    devGrantedScopes: ['status:read'],
    allowedHosts: ['127.0.0.1', 'localhost'],
    authIssuer: undefined,
    resourceUrl: undefined,
    authJwksUrl: undefined,
    authInternalIssuerUrl: undefined,
    rateLimitReadPerMinute: 120,
    rateLimitWritePerMinute: 20,
    rateLimitEnabled: true,
  };

  let running: RunningApp;
  let httpServer: ReturnType<RunningApp['app']['listen']>;
  let baseUrl: URL;

  beforeAll(async () => {
    running = createApp({ registry, sink, config });
    httpServer = running.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;
    config.allowedHosts.push(`127.0.0.1:${port}`);
    baseUrl = new URL(`http://127.0.0.1:${port}/mcp`);
  });

  afterAll(async () => {
    await running.closeSessions();
    httpServer.close();
  });

  async function connect(): Promise<Client> {
    const client = new Client({ name: 'kit-test-client', version: '0.0.1' });
    await client.connect(new StreamableHTTPClientTransport(baseUrl));
    return client;
  }

  it('serves health endpoints', async () => {
    const health = await fetch(new URL('/healthz', baseUrl));
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'ok' });
    const ready = await fetch(new URL('/readyz', baseUrl));
    expect(ready.status).toBe(200);
  });

  it('initializes a session, lists tools, calls the demo tool, and audits it', async () => {
    const client = await connect();
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain('get_service_status');

      sink.events.length = 0;
      const result = await client.callTool({ name: 'get_service_status', arguments: {} });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(JSON.parse(text)).toMatchObject({ status: 'ok', name: 'mcp-production-kit' });

      // M1 acceptance: audit row has actor/tool/args-hash/status/latency.
      expect(sink.events).toHaveLength(1);
      const event = sink.events[0]!;
      expect(event.actor).toBe('anonymous');
      expect(event.tool).toBe('get_service_status');
      expect(event.argsHash).toMatch(/^[0-9a-f]{64}$/);
      expect(event.status).toBe('ok');
      expect(event.latencyMs).toBeGreaterThanOrEqual(0);
      expect(event.traceId).toBeTruthy();
      expect(event.sessionId).toBeTruthy();
    } finally {
      await client.close();
    }
  });

  it('denies the tool call without the required scope and audits the denial', async () => {
    const originalScopes = config.devGrantedScopes;
    config.devGrantedScopes = []; // read per-session at connect time
    try {
      const client = await connect();
      try {
        sink.events.length = 0;
        const result = await client.callTool({ name: 'get_service_status', arguments: {} });
        expect(result.isError).toBe(true);
        expect(sink.events.map((e) => e.status)).toEqual(['denied']);
      } finally {
        await client.close();
      }
    } finally {
      config.devGrantedScopes = originalScopes;
    }
  });

  it('rejects non-initialize requests without a session', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    });
    expect(res.status).toBe(400);
  });
});
