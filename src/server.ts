/**
 * Streamable HTTP MCP server entry point.
 *
 * M1 wires this to the official @modelcontextprotocol/sdk Streamable HTTP
 * transport with session handling, the tool registry (src/tools), audit
 * middleware (src/audit), and health endpoints (src/observability).
 */

export const SERVER_NAME = 'mcp-production-kit';
export const SERVER_VERSION = '0.1.0';

export function createServer(): never {
  throw new Error('Not implemented yet — see docs/ROADMAP.md, milestone M1.');
}
