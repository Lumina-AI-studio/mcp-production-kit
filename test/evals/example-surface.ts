import { z } from 'zod';
import { defineTool, type ToolDefinition } from '../../src/tools/index.js';
import { getServiceStatus } from '../../src/tools/status.js';

/**
 * Lightweight stubs of the example SaaS tool surface (Nordwind), used only
 * for tool-selection evals. Another agent implements the real handlers in
 * example/src/tools/ — this file intentionally does not import from there,
 * so the eval harness stays decoupled from that work-in-progress.
 *
 * Names, descriptions, schemas and scopes here must stay in lockstep with
 * the real tools; a schema/description drift here silently invalidates the
 * evals (docs/tool-design.md: every new tool needs an eval case).
 */

export const searchCustomers: ToolDefinition = defineTool({
  name: 'search_customers',
  description: 'Search customers by name or email fragment.',
  inputSchema: z.object({ query: z.string() }),
  readOnly: true,
  requiredScopes: ['customers:read'],
  handler: async () => ({}),
});

export const getOrderDetails: ToolDefinition = defineTool({
  name: 'get_order_details',
  description: 'Fetch one order with its invoice and refund history by order id.',
  inputSchema: z.object({ orderId: z.string() }),
  readOnly: true,
  requiredScopes: ['orders:read'],
  handler: async () => ({}),
});

export const listOverdueInvoices: ToolDefinition = defineTool({
  name: 'list_overdue_invoices',
  description: 'List unpaid invoices past their due date, oldest first.',
  inputSchema: z.object({}),
  readOnly: true,
  requiredScopes: ['invoices:read'],
  handler: async () => ({}),
});

export const createRefundRequest: ToolDefinition = defineTool({
  name: 'create_refund_request',
  description:
    'Create a refund request for an order. Requires an explicit confirmation payload restating amount and reason.',
  inputSchema: z.object({
    orderId: z.string(),
    confirm: z.object({
      amountCents: z.number(),
      reason: z.string(),
    }),
  }),
  readOnly: false,
  requiredScopes: ['refunds:write'],
  handler: async () => ({}),
});

export const cancelOrder: ToolDefinition = defineTool({
  name: 'cancel_order',
  description: 'Cancel an order that has not shipped yet. Requires an explicit confirmation payload with a reason.',
  inputSchema: z.object({
    orderId: z.string(),
    confirm: z.object({
      reason: z.string(),
    }),
  }),
  readOnly: false,
  requiredScopes: ['orders:write'],
  handler: async () => ({}),
});

/** Real tool, imported for its real schema (src/tools/status.ts). */
export const getServiceStatusTool: ToolDefinition = getServiceStatus;

export const exampleToolSurface: ToolDefinition[] = [
  searchCustomers,
  getOrderDetails,
  listOverdueInvoices,
  createRefundRequest,
  cancelOrder,
  getServiceStatusTool,
];
