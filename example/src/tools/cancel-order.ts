import { z } from 'zod';
import { defineTool, type ToolDefinition } from '../../../src/tools/index.js';
import type { Db } from '../db.js';

interface OrderStatusRow {
  id: string;
  status: string;
}

interface CancelledOrderRow {
  id: string;
  customer_id: string;
  status: string;
  total_cents: number;
  placed_at: string;
}

const CANCELLABLE = new Set(['placed', 'paid']);

/**
 * `cancel_order` [orders:write] — WRITE tool. Only orders that have not yet
 * shipped (status placed|paid) can be cancelled; anything shipped/delivered/
 * already-cancelled throws and is audited as status=error. Requires a
 * `confirm.reason` so the cancellation is deliberate and recorded.
 */
export function cancelOrder(db: Db): ToolDefinition {
  return defineTool({
    name: 'cancel_order',
    description:
      'Cancel an order that has not shipped yet. Requires an explicit confirmation payload with a reason.',
    inputSchema: z.object({
      orderId: z.string(),
      confirm: z.object({
        reason: z.string().min(5),
      }),
    }),
    readOnly: false,
    requiredScopes: ['orders:write'],
    handler: async ({ orderId, confirm }) => {
      const orderResult = await db.query<OrderStatusRow>(
        `SELECT id, status FROM orders WHERE id = $1`,
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }
      if (!CANCELLABLE.has(order.status)) {
        throw new Error(
          `Order ${orderId} cannot be cancelled from status "${order.status}" (only placed|paid).`,
        );
      }

      const { rows } = await db.query<CancelledOrderRow>(
        `UPDATE orders SET status = 'cancelled'
          WHERE id = $1
          RETURNING id, customer_id, status, total_cents, placed_at`,
        [orderId],
      );
      return { order: rows[0], reason: confirm.reason };
    },
  });
}
