import type { ToolDefinition } from '../../../src/tools/index.js';
import type { Db } from '../db.js';
import { cancelOrder } from './cancel-order.js';
import { createRefundRequest } from './create-refund-request.js';
import { getOrderDetails } from './get-order-details.js';
import { listOverdueInvoices } from './list-overdue-invoices.js';
import { searchCustomers } from './search-customers.js';

/**
 * The five task-oriented Nordwind tools, each bound to an injected `Db` seam
 * (tests pass a stub, main.ts passes a pg-backed PoolDb). Three read-only,
 * two write tools with confirmation payloads — see docs/tool-design.md.
 */
export function exampleTools(db: Db): ToolDefinition[] {
  return [
    searchCustomers(db),
    getOrderDetails(db),
    listOverdueInvoices(db),
    createRefundRequest(db),
    cancelOrder(db),
  ];
}

export {
  cancelOrder,
  createRefundRequest,
  getOrderDetails,
  listOverdueInvoices,
  searchCustomers,
};
