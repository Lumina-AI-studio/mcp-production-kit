import { z } from 'zod';
import { healthPayload } from '../observability/index.js';
import { defineTool, type ToolDefinition } from './index.js';

/**
 * Demo read-only tool so M1 has something callable end-to-end (MCP Inspector
 * → tool call → audit event). Replaced as the showcase by the example SaaS
 * tools in M3, but stays as the built-in smoke-test tool.
 */
export const getServiceStatus: ToolDefinition = defineTool({
  name: 'get_service_status',
  description:
    'Report the MCP server health: name, version and uptime. Use to verify connectivity.',
  inputSchema: z.object({}),
  readOnly: true,
  requiredScopes: ['status:read'],
  handler: async () => healthPayload(),
});
