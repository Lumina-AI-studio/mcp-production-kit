import { z } from 'zod';
import { defineTool, type ToolDefinition } from '../../../src/tools/index.js';
import type { Db } from '../db.js';

interface OrderRow {
  id: string;
  customer_id: string;
  status: string;
  total_cents: number;
  placed_at: string;
}

interface InvoiceRow {
  id: string;
  order_id: string;
  amount_cents: number;
  due_date: string;
  paid_at: string | null;
}

interface RefundRow {
  id: string;
  order_id: string;
  amount_cents: number;
  reason: string;
  status: string;
  requested_by: string;
  created_at: string;
}

/**
 * `get_order_details` [orders:read] — one order plus its invoice(s) and
 * refund history. Throws when the order id is unknown so the miss is audited
 * as status=error rather than returning a silent empty shell.
 */
export function getOrderDetails(db: Db): ToolDefinition {
  return defineTool({
    name: 'get_order_details',
    description: 'Fetch one order with its invoice and refund history by order id.',
    inputSchema: z.object({
      orderId: z.string(),
    }),
    readOnly: true,
    requiredScopes: ['orders:read'],
    handler: async ({ orderId }) => {
      const orderResult = await db.query<OrderRow>(
        `SELECT id, customer_id, status, total_cents, placed_at
           FROM orders WHERE id = $1`,
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const [invoices, refunds] = await Promise.all([
        db.query<InvoiceRow>(
          `SELECT id, order_id, amount_cents, due_date, paid_at
             FROM invoices WHERE order_id = $1 ORDER BY due_date ASC`,
          [orderId],
        ),
        db.query<RefundRow>(
          `SELECT id, order_id, amount_cents, reason, status, requested_by, created_at
             FROM refund_requests WHERE order_id = $1 ORDER BY created_at ASC`,
          [orderId],
        ),
      ]);

      return { order, invoices: invoices.rows, refundRequests: refunds.rows };
    },
  });
}
