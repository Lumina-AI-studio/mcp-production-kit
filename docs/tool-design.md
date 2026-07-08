# Tool design guide

This is the differentiator of the template. Full guide lands alongside M3's
example tools; the principles are binding from day one.

## 1. Task-oriented tools, not CRUD dumps

Expose `create_refund_request`, not `POST /refunds`. Design tools around the
tasks an agent performs, not around your REST surface. A small, well-named
tool count beats a big context window full of endpoints.

## 2. Read-only by default

Every tool declares `readOnly`. Write tools must:

- opt out explicitly (`readOnly: false`),
- require a dedicated write scope (never bundled into a read scope),
- take a structured confirmation payload in their schema so the agent has to
  restate what it is about to do.

## 3. Audit answers the compliance question

"Which agent called which tool with what data at what time." Every tool call
produces an audit event: actor, tool, args hash, status, latency, trace id.
The sink is append-only and exportable. Args are hashed, not stored —
GDPR-aware by construction, with PII redaction hooks for payload fields that
must be inspectable.

## 4. No tool without a scope mapping

RBAC is deny-by-default: a tool absent from the scope map is not callable,
by anyone, ever. Shipping a tool means shipping its scope mapping and its
tests (schema test, audit-event test, eval case).
