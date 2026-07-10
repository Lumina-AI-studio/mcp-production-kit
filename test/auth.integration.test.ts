import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthContext } from '../src/auth/index.js';
import { JwksTokenVerifier } from '../src/auth/verifier.js';
import { InMemorySink } from '../src/audit/sink.js';
import type { Config } from '../src/config.js';
import { createApp, type RunningApp } from '../src/server.js';
import { defineTool, ToolRegistry } from '../src/tools/index.js';
import { getServiceStatus } from '../src/tools/status.js';

/**
 * M2 acceptance + negative matrix (CLAUDE.md: every auth change needs a
 * negative test). Tokens are minted locally against an in-memory JWKS —
 * no network, fully deterministic.
 */

const ISSUER = 'https://idp.test/realms/kit';
let RESOURCE = 'http://127.0.0.1:0/mcp'; // finalized once the port is known

const submitRefundRequest = defineTool({
  name: 'submit_refund_request',
  description: 'Submit a refund request for review (demo write tool).',
  inputSchema: z.object({
    orderId: z.string(),
    confirm: z.object({ amountCents: z.number().int(), reason: z.string() }),
  }),
  readOnly: false,
  requiredScopes: ['refunds:write'],
  handler: async (args) => ({ accepted: true, orderId: args.orderId }),
});

describe('OAuth 2.1 resource server (M2)', () => {
  const sink = new InMemorySink();
  const registry = new ToolRegistry();
  registry.register(getServiceStatus);
  registry.register(submitRefundRequest);

  let running: RunningApp;
  let httpServer: ReturnType<RunningApp['app']['listen']>;
  let baseUrl: URL;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let publicJwk: JWK;

  const config: Config = {
    port: 0,
    host: '127.0.0.1',
    auditDatabaseUrl: undefined,
    // Must be ignored when auth is enabled — proven in a test below.
    devGrantedScopes: ['status:read', 'refunds:write'],
    allowedHosts: ['127.0.0.1', 'localhost'],
    authIssuer: ISSUER,
    resourceUrl: RESOURCE,
    authJwksUrl: undefined,
    authInternalIssuerUrl: undefined,
    rateLimitReadPerMinute: 120,
    rateLimitWritePerMinute: 20,
    rateLimitEnabled: true,
  };

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };

    // Reserve a port first so the canonical resource URI is stable.
    const probe = createApp({
      registry,
      sink,
      config,
      auth: undefined,
    }).app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => probe.once('listening', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    RESOURCE = `http://127.0.0.1:${port}/mcp`;
    config.resourceUrl = RESOURCE;
    config.allowedHosts.push(`127.0.0.1:${port}`);

    const auth: AuthContext = {
      verifier: new JwksTokenVerifier({
        issuer: ISSUER,
        audience: RESOURCE,
        keySource: createLocalJWKSet({ keys: [publicJwk] }),
      }),
      oauthMetadata: {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
        token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
        jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      } as OAuthMetadata,
      resourceServerUrl: new URL(RESOURCE),
    };

    running = createApp({ registry, sink, config, auth });
    httpServer = running.app.listen(port, '127.0.0.1');
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    baseUrl = new URL(RESOURCE);
  });

  afterAll(async () => {
    await running.closeSessions();
    httpServer.close();
  });

  interface MintOverrides {
    scope?: string;
    aud?: string;
    iss?: string;
    expiresIn?: string;
    sub?: string;
  }

  async function mintToken(overrides: MintOverrides = {}): Promise<string> {
    return new SignJWT({ scope: overrides.scope ?? 'status:read', azp: 'test-client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(overrides.iss ?? ISSUER)
      .setAudience(overrides.aud ?? RESOURCE)
      .setSubject(overrides.sub ?? 'user-42')
      .setIssuedAt()
      .setExpirationTime(overrides.expiresIn ?? '5m')
      .sign(privateKey);
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'kit-auth-test', version: '0.0.1' });
    await client.connect(
      new StreamableHTTPClientTransport(baseUrl, {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  }

  it('serves RFC 9728 protected resource metadata', async () => {
    const res = await fetch(
      new URL(`/.well-known/oauth-protected-resource${baseUrl.pathname}`, baseUrl.origin),
    );
    expect(res.status).toBe(200);
    const prm = (await res.json()) as {
      resource: string;
      authorization_servers: string[];
      scopes_supported: string[];
    };
    expect(prm.resource).toBe(RESOURCE);
    expect(prm.authorization_servers).toContain(ISSUER);
    expect(prm.scopes_supported).toEqual(
      expect.arrayContaining(['status:read', 'refunds:write']),
    );
  });

  it('401s GET /mcp (the SSE stream) without a token', async () => {
    const res = await fetch(baseUrl, { method: 'GET', headers: { accept: 'text/event-stream' } });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate') ?? '').toContain('resource_metadata=');
  });

  it('401s DELETE /mcp (session termination) without a token', async () => {
    const res = await fetch(baseUrl, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('binds a session to its creator — a different valid principal cannot drive it', async () => {
    const tokenA = await mintToken({ sub: 'user-alice' });
    const tokenB = await mintToken({ sub: 'user-bob' });

    // Alice initializes a session; capture its id from the response header.
    const initRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'A', version: '0' } },
      }),
    });
    expect(initRes.status).toBe(200);
    const sid = initRes.headers.get('mcp-session-id');
    expect(sid).toBeTruthy();

    const bobHeaders = {
      authorization: `Bearer ${tokenB}`,
      'mcp-session-id': sid as string,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    };

    // Bob's token is perfectly valid, but he does not own Alice's session:
    // he can neither POST into it, attach to its stream, nor terminate it.
    const bobPost = await fetch(baseUrl, {
      method: 'POST',
      headers: bobHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(bobPost.status).toBe(403);

    const bobGet = await fetch(baseUrl, { method: 'GET', headers: bobHeaders });
    expect(bobGet.status).toBe(403);

    const bobDelete = await fetch(baseUrl, { method: 'DELETE', headers: bobHeaders });
    expect(bobDelete.status).toBe(403);

    // Alice still owns it and can terminate her own session.
    const aliceDelete = await fetch(baseUrl, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenA}`, 'mcp-session-id': sid as string },
    });
    expect([200, 204]).toContain(aliceDelete.status);
  });

  it('401s requests without a token, with WWW-Authenticate → resource_metadata', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: {}, id: 1 }),
    });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain('resource_metadata=');
    expect(challenge).toContain('/.well-known/oauth-protected-resource');
  });

  // The SDK client surfaces the 401 response body (invalid_token error JSON)
  // in the thrown error, so that's what we assert on.
  it('401s tokens with the wrong audience (audience binding)', async () => {
    const token = await mintToken({ aud: 'https://some-other-api.example.com' });
    await expect(connect(token)).rejects.toThrow(/invalid_token.*aud/);
  });

  it('401s tokens from the wrong issuer', async () => {
    const token = await mintToken({ iss: 'https://evil.example.com' });
    await expect(connect(token)).rejects.toThrow(/invalid_token.*iss/);
  });

  it('401s expired tokens', async () => {
    const token = await mintToken({ expiresIn: '-5m' });
    await expect(connect(token)).rejects.toThrow(/invalid_token.*exp/);
  });

  it('M2 acceptance: read-scoped token lists tools but cannot call the write tool', async () => {
    const client = await connect(await mintToken({ scope: 'status:read' }));
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toEqual(
        expect.arrayContaining(['get_service_status', 'submit_refund_request']),
      );

      sink.events.length = 0;
      const denied = await client.callTool({
        name: 'submit_refund_request',
        arguments: { orderId: 'o-1', confirm: { amountCents: 100, reason: 'test' } },
      });
      expect(denied.isError).toBe(true);

      // DEV_GRANTED_SCOPES includes refunds:write — must be ignored with auth on.
      expect(sink.events.map((e) => e.status)).toEqual(['denied']);
      expect(sink.events[0]!.actor).toBe('user-42');

      const allowed = await client.callTool({ name: 'get_service_status', arguments: {} });
      expect(allowed.isError).toBeFalsy();
    } finally {
      await client.close();
    }
  });

  it('write-scoped token can call the write tool, audited with token identity', async () => {
    const client = await connect(await mintToken({ scope: 'status:read refunds:write' }));
    try {
      sink.events.length = 0;
      const result = await client.callTool({
        name: 'submit_refund_request',
        arguments: { orderId: 'o-2', confirm: { amountCents: 250, reason: 'damaged' } },
      });
      expect(result.isError).toBeFalsy();
      expect(sink.events.map((e) => e.status)).toEqual(['ok']);
      expect(sink.events[0]!.actor).toBe('user-42');
      expect(sink.events[0]!.tool).toBe('submit_refund_request');
    } finally {
      await client.close();
    }
  });
});
