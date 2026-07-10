# Tool design guide

This is the differentiator of the template. The
[Nordwind example](../example/README.md) puts every principle here into
practice.

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

## 5. Evals

A tool's name, description and schema are the only signal an agent gets
when deciding whether to call it. If those are vague or overlapping, the
agent picks the wrong tool — no amount of runtime validation fixes a bad
selection decision made before the call. CLAUDE.md's testing rule ("every
new tool needs: schema test, audit-event test, eval case") exists because
this failure mode is invisible to unit tests: a tool can have a perfect
zod schema and a correct handler and still be un-selectable in practice
because its description reads like three other tools in the surface.

The eval harness lives in `test/evals/`:

- `harness.ts` — calls the Anthropic Messages API directly (`fetch`, no
  SDK) with `tool_choice: 'auto'` and the tool surface converted to JSON
  Schema via `z.toJSONSchema`, then checks which tool (if any) the model
  called against the expected tool for that prompt.
- `cases.ts` — the eval cases: a `note` argues why we expect it.
- `example-surface.ts` — lightweight `ToolDefinition` stubs mirroring the
  Nordwind example tool surface exactly (name/description/scopes), so
  evals don't couple to the example app's handler implementation.
- `evals.test.ts` — vitest wrapper around the live API calls.
- `harness.test.ts` — deterministic unit tests for the harness itself
  (schema mapping, result classification), mocked `fetch`, no network,
  always runs.

### Running the evals

Live evals need `ANTHROPIC_API_KEY` and hit the real API, so they are
skipped by default (including in CI, which has no key) via
`describe.skipIf(!process.env.ANTHROPIC_API_KEY)` — the skip reason is
visible in the vitest output.

```sh
ANTHROPIC_API_KEY=sk-... ./node_modules/.bin/vitest run test/evals/evals.test.ts
```

Once wired up as an npm script (`pnpm evals`), the same command becomes:

```sh
ANTHROPIC_API_KEY=sk-... pnpm evals
```

`EVAL_MODEL` overrides the model (defaults to a Haiku model — cheap and
representative of the weakest model this surface has to work for). The
suite asserts an overall pass rate of at least 80%, not 100%: a single
brittle prompt shouldn't fail the whole build, but a broadly confusable
tool surface should.

### Adding a case

Add an `EvalCase` to `cases.ts`:

```ts
{
  prompt: 'a realistic user or agent-facing prompt',
  expectTool: 'the_tool_name', // or null if no tool should be called
  note: 'why this prompt should resolve to this tool',
}
```

Every new tool needs at least one clearly-matching case. If the tool is
easily confused with a sibling (e.g. refund vs. cancel, or a tool that
takes an ID directly vs. one that searches for it first), add an
ambiguity probe that asserts the correct one wins. Add `expectTool: null`
cases sparingly, to catch a tool surface that's over-eager to fire on
unrelated prompts.
