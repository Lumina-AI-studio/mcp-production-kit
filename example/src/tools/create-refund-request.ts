import { z } from 'zod';
import { defineTool, type ToolDefinition } from '../../../src/tools/index.js';
import type { Db } from '../db.js';

interface OrderTotalRow {
  id: string;
  total_cents: number;
}

interface RefundInsertRow {
  id: string;
  order_id: string;
  amount_cents: number;
  reason: string;
  status: string;
  requested_by: string;
  created_at: string;
}

/**
 * `create_refund_request` [refunds:write] — WRITE tool. Requires an explicit
 * `confirm` payload restating the amount and reason so the agent has to
 * commit to exactly what it is about to do (docs/tool-design.md §2). Domain
 * rules: the order must exist and the refund cannot exceed the order total;
 * violations throw and are audited as status=error.
 */
export function createRefundRequest(db: Db): ToolDefinition {
  return defineTool({
    name: 'create_refund_request',
    description:
      'Create a refund request for an order. Requires an explicit confirmation payload restating amount and reason.',
    inputSchema: z.object({
      orderId: z.string(),
      confirm: z.object({
        amountCents: z.number().int().positive(),
        reason: z.string().min(5),
      }),
    }),
    readOnly: false,
    requiredScopes: ['refunds:write'],
    handler: async ({ orderId, confirm }, ctx) => {
      const orderResult = await db.query<OrderTotalRow>(
        `SELECT id, total_cents FROM orders WHERE id = $1`,
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }
      if (confirm.amountCents > order.total_cents) {
        throw new Error(
          `Refund amount ${confirm.amountCents} exceeds order total ${order.total_cents}.`,
        );
      }

      const { rows } = await db.query<RefundInsertRow>(
        `INSERT INTO refund_requests (order_id, amount_cents, reason, requested_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, order_id, amount_cents, reason, status, requested_by, created_at`,
        [orderId, confirm.amountCents, confirm.reason, ctx.actor],
      );
      return { refundRequest: rows[0] };
    },
  });
}
