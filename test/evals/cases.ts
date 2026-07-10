import type { EvalCase } from './harness.js';

/**
 * Tool-selection eval cases for the example SaaS tool surface
 * (test/evals/example-surface.ts). Each tool gets at least one
 * clearly-matching prompt, plus ambiguity probes and no-tool-call cases.
 *
 * docs/tool-design.md requires an eval case per new tool — add one here
 * whenever a tool is added to example-surface.ts.
 */
export const cases: EvalCase[] = [
  // search_customers
  {
    prompt: 'Can you look up the customer named Anna Keller?',
    expectTool: 'search_customers',
    note: 'clear match: name search',
  },
  {
    prompt: 'Find any customers with an email containing "@rieger-gmbh.de".',
    expectTool: 'search_customers',
    note: 'clear match: email fragment search',
  },

  // get_order_details
  {
    prompt: 'What is the current status of order o_9981, and were there any refunds on it?',
    expectTool: 'get_order_details',
    note: 'clear match: single order lookup incl. refund history',
  },
  {
    prompt: 'Pull up the invoice and refund history for order o_5521.',
    expectTool: 'get_order_details',
    note: 'clear match',
  },

  // list_overdue_invoices
  {
    prompt: 'Which invoices are overdue more than 30 days?',
    expectTool: 'list_overdue_invoices',
    note: 'clear match',
  },
  {
    prompt: 'Give me the list of unpaid invoices, oldest first.',
    expectTool: 'list_overdue_invoices',
    note: 'clear match',
  },

  // create_refund_request
  {
    prompt:
      'Customer is asking for money back on order o_1042, 4500 cents, item arrived damaged. Please file the refund.',
    expectTool: 'create_refund_request',
    note: 'clear match: amount + reason present for confirm payload',
  },
  {
    prompt: 'Refund order o_2200 for 1200 cents — customer says it never shipped.',
    expectTool: 'create_refund_request',
    note: 'clear match',
  },

  // cancel_order
  {
    prompt: 'Order o_3310 has not shipped yet and the customer wants to cancel it because they ordered twice by mistake.',
    expectTool: 'cancel_order',
    note: 'clear match',
  },
  {
    prompt: 'Please cancel order o_7788, reason: customer changed their mind, it has not left the warehouse.',
    expectTool: 'cancel_order',
    note: 'clear match',
  },

  // get_service_status
  {
    prompt: 'Is the MCP server up? Check connectivity and uptime.',
    expectTool: 'get_service_status',
    note: 'clear match',
  },
  {
    prompt: 'What version of the server are we running and how long has it been up?',
    expectTool: 'get_service_status',
    note: 'clear match',
  },

  // Ambiguity probe: should prefer get_order_details over search_customers
  // because an order id is given directly — no need to search for the
  // customer first.
  {
    prompt: 'Order o_4471 — can you tell me its invoice and refund history?',
    expectTool: 'get_order_details',
    note: 'ambiguity probe: order id given, should not search_customers first',
  },

  // Ambiguity probe: refund vs cancel — order already shipped, so refund
  // is the correct tool, not cancel_order.
  {
    prompt:
      'Customer received order o_6602 but it was the wrong size. It already shipped, they want their 3000 cents back for a return.',
    expectTool: 'create_refund_request',
    note: 'ambiguity probe: shipped order, refund not cancel',
  },

  // expectTool: null — no matching tool, agent should not call anything.
  {
    prompt: 'Write me a haiku about invoices.',
    expectTool: null,
    note: 'no tool call: creative writing request unrelated to tools',
  },
  {
    prompt: "What's the weather like in Hamburg today?",
    expectTool: null,
    note: 'no tool call: out-of-domain question, no matching tool',
  },
];
