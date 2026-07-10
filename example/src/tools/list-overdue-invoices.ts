import { z } from 'zod';
import { defineTool, type ToolDefinition } from '../../../src/tools/index.js';
import type { Db } from '../db.js';

interface OverdueInvoiceRow {
  id: string;
  order_id: string;
  amount_cents: number;
  due_date: string;
  customer_id: string;
  days_overdue: number;
}

/**
 * `list_overdue_invoices` [invoices:read] — unpaid invoices whose due date is
 * already at least `olderThanDays` in the past, oldest first. `olderThanDays`
 * lets an agent focus on invoices that have been overdue for a while.
 */
export function listOverdueInvoices(db: Db): ToolDefinition {
  return defineTool({
    name: 'list_overdue_invoices',
    description: 'List unpaid invoices past their due date, oldest first.',
    inputSchema: z.object({
      olderThanDays: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    readOnly: true,
    requiredScopes: ['invoices:read'],
    handler: async ({ olderThanDays, limit }) => {
      const { rows } = await db.query<OverdueInvoiceRow>(
        `SELECT i.id,
                i.order_id,
                i.amount_cents,
                i.due_date,
                o.customer_id,
                (CURRENT_DATE - i.due_date) AS days_overdue
           FROM invoices i
           JOIN orders o ON o.id = i.order_id
          WHERE i.paid_at IS NULL
            AND i.due_date < (CURRENT_DATE - ($1 * INTERVAL '1 day'))
          ORDER BY i.due_date ASC
          LIMIT $2`,
        [olderThanDays, limit],
      );
      return { invoices: rows, count: rows.length };
    },
  });
}
