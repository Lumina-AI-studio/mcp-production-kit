import { describe, expect, it } from 'vitest';
import { executeTool } from '../src/audit/execute.js';
import { InMemorySink } from '../src/audit/sink.js';
import { scopeMapFromTools } from '../src/rbac/index.js';
import type { ToolContext } from '../src/tools/index.js';
import type { Db, QueryResult } from '../example/src/db.js';
import {
  cancelOrder,
  createRefundRequest,
  exampleTools,
  getOrderDetails,
  listOverdueInvoices,
  searchCustomers,
} from '../example/src/tools/index.js';

/**
 * A recording stub for the narrow Db seam. Each SQL call pops the next queued
 * result; the tools never see a real Postgres (CI has none). `calls` lets a
 * test assert what was executed.
 */
function stubDb(results: Array<{ rows: unknown[] }>): Db & {
  calls: Array<{ sql: string; params: readonly unknown[] }>;
} {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  let i = 0;
  return {
    calls,
    async query<Row>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<Row>> {
      calls.push({ sql, params });
      const next = results[i++] ?? { rows: [] };
      return { rows: next.rows as Row[] };
    },
  };
}

const ctx: ToolContext = { actor: 'demo-agent', traceId: 'trace-x', sessionId: 'sess-x' };

describe('example tools — registration & scope mappings', () => {
  it('exposes exactly the five Nordwind tools, none unmapped', () => {
    const tools = exampleTools(stubDb([]));
    expect(tools.map((t) => t.name)).toEqual([
      'search_customers',
      'get_order_details',
      'list_overdue_invoices',
      'create_refund_request',
      'cancel_order',
    ]);
    // deny-by-default: every tool carries a non-empty scope.
    for (const tool of tools) {
      expect(tool.requiredScopes.length).toBeGreaterThan(0);
    }
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName['search_customers']!.requiredScopes).toEqual(['customers:read']);
    expect(byName['get_order_details']!.requiredScopes).toEqual(['orders:read']);
    expect(byName['list_overdue_invoices']!.requiredScopes).toEqual(['invoices:read']);
    expect(byName['create_refund_request']!.requiredScopes).toEqual(['refunds:write']);
    expect(byName['cancel_order']!.requiredScopes).toEqual(['orders:write']);
    // write tools opt out of read-only explicitly.
    expect(byName['create_refund_request']!.readOnly).toBe(false);
    expect(byName['cancel_order']!.readOnly).toBe(false);
    expect(byName['search_customers']!.readOnly).toBe(true);
  });
});

describe('search_customers — schema', () => {
  const tool = searchCustomers(stubDb([]));

  it('accepts a valid query and defaults limit', () => {
    const parsed = tool.inputSchema.parse({ query: 'ada' });
    expect(parsed).toEqual({ query: 'ada', limit: 10 });
  });

  it('rejects a too-short query', () => {
    expect(tool.inputSchema.safeParse({ query: 'a' }).success).toBe(false);
  });

  it('rejects a limit over 50', () => {
    expect(tool.inputSchema.safeParse({ query: 'ada', limit: 51 }).success).toBe(false);
  });

  it('queries by ILIKE fragment and returns rows', async () => {
    const db = stubDb([{ rows: [{ id: 'cus_ada', name: 'Ada Lovelace' }] }]);
    const result = (await searchCustomers(db).handler(
      { query: 'ada', limit: 10 },
      ctx,
    )) as { count: number };
    expect(result.count).toBe(1);
    expect(db.calls[0]!.params).toEqual(['%ada%', 10]);
  });
});

describe('get_order_details — schema & domain', () => {
  it('accepts an orderId', () => {
    expect(getOrderDetails(stubDb([])).inputSchema.safeParse({ orderId: 'ord_1001' }).success).toBe(
      true,
    );
  });

  it('rejects a missing orderId', () => {
    expect(getOrderDetails(stubDb([])).inputSchema.safeParse({}).success).toBe(false);
  });

  it('throws when the order does not exist', async () => {
    const db = stubDb([{ rows: [] }]);
    await expect(getOrderDetails(db).handler({ orderId: 'nope' }, ctx)).rejects.toThrow(
      /Order not found/,
    );
  });

  it('assembles order + invoices + refunds', async () => {
    const db = stubDb([
      { rows: [{ id: 'ord_1001', status: 'delivered', total_cents: 12900 }] },
      { rows: [{ id: 'inv_2001' }] },
      { rows: [{ id: 'rr_seed0001' }] },
    ]);
    const result = (await getOrderDetails(db).handler({ orderId: 'ord_1001' }, ctx)) as {
      order: { id: string };
      invoices: unknown[];
      refundRequests: unknown[];
    };
    expect(result.order.id).toBe('ord_1001');
    expect(result.invoices).toHaveLength(1);
    expect(result.refundRequests).toHaveLength(1);
  });
});

describe('list_overdue_invoices — schema', () => {
  const tool = listOverdueInvoices(stubDb([]));

  it('defaults olderThanDays and limit', () => {
    expect(tool.inputSchema.parse({})).toEqual({ olderThanDays: 0, limit: 20 });
  });

  it('rejects a negative olderThanDays', () => {
    expect(tool.inputSchema.safeParse({ olderThanDays: -1 }).success).toBe(false);
  });

  it('rejects a limit over 100', () => {
    expect(tool.inputSchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('passes olderThanDays and limit as params', async () => {
    const db = stubDb([{ rows: [{ id: 'inv_2007' }] }]);
    await listOverdueInvoices(db).handler({ olderThanDays: 30, limit: 20 }, ctx);
    expect(db.calls[0]!.params).toEqual([30, 20]);
  });
});

describe('create_refund_request — schema & domain rules', () => {
  it('requires a confirmation payload with amount and reason', () => {
    const tool = createRefundRequest(stubDb([]));
    expect(
      tool.inputSchema.safeParse({
        orderId: 'ord_1001',
        confirm: { amountCents: 100, reason: 'damaged goods' },
      }).success,
    ).toBe(true);
    // missing confirm entirely
    expect(tool.inputSchema.safeParse({ orderId: 'ord_1001' }).success).toBe(false);
    // reason too short
    expect(
      tool.inputSchema.safeParse({
        orderId: 'ord_1001',
        confirm: { amountCents: 100, reason: 'bad' },
      }).success,
    ).toBe(false);
    // non-positive amount
    expect(
      tool.inputSchema.safeParse({
        orderId: 'ord_1001',
        confirm: { amountCents: 0, reason: 'damaged goods' },
      }).success,
    ).toBe(false);
  });

  it('throws when the order does not exist', async () => {
    const db = stubDb([{ rows: [] }]);
    await expect(
      createRefundRequest(db).handler(
        { orderId: 'nope', confirm: { amountCents: 100, reason: 'damaged goods' } },
        ctx,
      ),
    ).rejects.toThrow(/Order not found/);
  });

  it('throws when a single refund exceeds the order total', async () => {
    const db = stubDb([
      { rows: [{ id: 'ord_1001', total_cents: 5000 }] },
      { rows: [{ sum: 0 }] }, // nothing refunded yet
    ]);
    await expect(
      createRefundRequest(db).handler(
        { orderId: 'ord_1001', confirm: { amountCents: 6000, reason: 'over the total' } },
        ctx,
      ),
    ).rejects.toThrow(/exceeds order total/);
  });

  it('throws when cumulative refunds would exceed the order total', async () => {
    // Order total 10000, 8000 already requested; a further 3000 must fail.
    const db = stubDb([
      { rows: [{ id: 'ord_1001', total_cents: 10000 }] },
      { rows: [{ sum: 8000 }] },
    ]);
    await expect(
      createRefundRequest(db).handler(
        { orderId: 'ord_1001', confirm: { amountCents: 3000, reason: 'second refund attempt' } },
        ctx,
      ),
    ).rejects.toThrow(/already requested/);
    // insert must NOT have run
    expect(db.calls).toHaveLength(2);
  });

  it('inserts a refund request within the remaining total and records the actor', async () => {
    const db = stubDb([
      { rows: [{ id: 'ord_1001', total_cents: 12900 }] },
      { rows: [{ sum: 2900 }] }, // one prior refund; 2900 + 2900 <= 12900
      { rows: [{ id: 'rr_new', order_id: 'ord_1001', amount_cents: 2900 }] },
    ]);
    const result = (await createRefundRequest(db).handler(
      { orderId: 'ord_1001', confirm: { amountCents: 2900, reason: 'damaged on arrival' } },
      ctx,
    )) as { refundRequest: { id: string } };
    expect(result.refundRequest.id).toBe('rr_new');
    // actor threaded into requested_by on the INSERT (third query)
    expect(db.calls[2]!.params).toContain('demo-agent');
  });
});

describe('cancel_order — schema & domain rules', () => {
  it('requires a confirmation reason of at least 5 chars', () => {
    const tool = cancelOrder(stubDb([]));
    expect(
      tool.inputSchema.safeParse({ orderId: 'ord_1004', confirm: { reason: 'wrong item' } }).success,
    ).toBe(true);
    expect(tool.inputSchema.safeParse({ orderId: 'ord_1004', confirm: { reason: 'no' } }).success).toBe(
      false,
    );
    expect(tool.inputSchema.safeParse({ orderId: 'ord_1004' }).success).toBe(false);
  });

  it('throws when the order does not exist', async () => {
    const db = stubDb([{ rows: [] }]);
    await expect(
      cancelOrder(db).handler({ orderId: 'nope', confirm: { reason: 'changed mind' } }, ctx),
    ).rejects.toThrow(/Order not found/);
  });

  it('throws when the order has already shipped', async () => {
    // The conditional UPDATE matches no row; the diagnostic SELECT reveals why.
    const db = stubDb([
      { rows: [] },
      { rows: [{ id: 'ord_1003', status: 'shipped' }] },
    ]);
    await expect(
      cancelOrder(db).handler({ orderId: 'ord_1003', confirm: { reason: 'too late now' } }, ctx),
    ).rejects.toThrow(/cannot be cancelled/);
  });

  it('cancels a placed order via a single conditional update', async () => {
    const db = stubDb([{ rows: [{ id: 'ord_1004', status: 'cancelled' }] }]);
    const result = (await cancelOrder(db).handler(
      { orderId: 'ord_1004', confirm: { reason: 'customer changed mind' } },
      ctx,
    )) as { order: { status: string }; reason: string };
    expect(result.order.status).toBe('cancelled');
    expect(result.reason).toBe('customer changed mind');
    // exactly one statement — the atomic UPDATE ... WHERE status IN (...)
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]!.sql).toMatch(/UPDATE orders/);
  });
});

describe('example tools — audit coverage via executeTool', () => {
  it('emits status=ok for a successful read tool', async () => {
    const db = stubDb([{ rows: [{ id: 'cus_ada' }] }]);
    const tool = searchCustomers(db);
    const scopeMap = scopeMapFromTools([tool]);
    const sink = new InMemorySink();

    const outcome = await executeTool(tool, { query: 'ada', limit: 10 }, ctx, ['customers:read'], {
      scopeMap,
      sink,
    });

    expect(outcome.ok).toBe(true);
    expect(sink.events.map((e) => e.status)).toEqual(['ok']);
    expect(sink.events[0]!.tool).toBe('search_customers');
    expect(sink.events[0]!.actor).toBe('demo-agent');
  });

  it('emits status=denied without the write scope', async () => {
    const db = stubDb([]);
    const tool = createRefundRequest(db);
    const scopeMap = scopeMapFromTools([tool]);
    const sink = new InMemorySink();

    const outcome = await executeTool(
      tool,
      { orderId: 'ord_1001', confirm: { amountCents: 100, reason: 'damaged goods' } },
      ctx,
      ['customers:read'], // wrong scope
      { scopeMap, sink },
    );

    expect(outcome.ok).toBe(false);
    expect(sink.events.map((e) => e.status)).toEqual(['denied']);
    // handler never ran → no DB query
    expect(db.calls).toHaveLength(0);
  });

  it('emits status=error when a domain rule throws', async () => {
    const db = stubDb([
      { rows: [{ id: 'ord_1001', total_cents: 5000 }] },
      { rows: [{ sum: 0 }] },
    ]);
    const tool = createRefundRequest(db);
    const scopeMap = scopeMapFromTools([tool]);
    const sink = new InMemorySink();

    const outcome = await executeTool(
      tool,
      { orderId: 'ord_1001', confirm: { amountCents: 9999, reason: 'over the total' } },
      ctx,
      ['refunds:write'],
      { scopeMap, sink },
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toMatch(/exceeds order total/);
    expect(sink.events.map((e) => e.status)).toEqual(['error']);
  });
});
