import { z } from 'zod';
import { defineTool, type ToolDefinition } from '../../../src/tools/index.js';
import type { Db } from '../db.js';

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  country: string;
  created_at: string;
}

/**
 * `search_customers` [customers:read] — read-only lookup by name/email
 * fragment. Case-insensitive substring match; capped result set so an agent
 * cannot page the whole table in one call.
 */
export function searchCustomers(db: Db): ToolDefinition {
  return defineTool({
    name: 'search_customers',
    description: 'Search customers by name or email fragment.',
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    readOnly: true,
    requiredScopes: ['customers:read'],
    handler: async ({ query, limit }) => {
      const like = `%${query}%`;
      const { rows } = await db.query<CustomerRow>(
        `SELECT id, name, email, country, created_at
           FROM customers
          WHERE name ILIKE $1 OR email ILIKE $1
          ORDER BY name ASC
          LIMIT $2`,
        [like, limit],
      );
      return { customers: rows, count: rows.length };
    },
  });
}
