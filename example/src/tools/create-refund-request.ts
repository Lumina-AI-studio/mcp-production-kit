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
 * rules: the order must exist and the refund — added to refunds already
 * requested against the order — cannot exceed the order total; violations
 * throw and are audited as status=error.
 *
 * Note: the "already refunded" sum and the insert are two statements, so two
 * truly-simultaneous requests could still race past the limit. For a demo
 * that's acceptable; a production tool would do it in one guarded statement
 * or a transaction.
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

      // Sum refunds already requested against this order (anything not
      // rejected) so repeated calls can't cumulatively exceed the total.
      const priorResult = await db.query<{ sum: number }>(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS sum
           FROM refund_requests
          WHERE order_id = $1 AND status <> 'rejected'`,
        [orderId],
      );
      const alreadyRefunded = priorResult.rows[0]?.sum ?? 0;
      if (alreadyRefunded + confirm.amountCents > order.total_cents) {
        throw new Error(
          `Refund amount ${confirm.amountCents} plus ${alreadyRefunded} already requested ` +
            `exceeds order total ${order.total_cents}.`,
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
