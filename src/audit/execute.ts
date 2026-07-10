import type { RateLimiter } from '../rate-limit/index.js';
import { isToolAllowed, type ScopeMap } from '../rbac/index.js';
import type { ToolContext, ToolDefinition } from '../tools/index.js';
import { hashArgs, type AuditEvent } from './index.js';
import type { AuditSink } from './sink.js';

export interface ExecutionResult {
  ok: boolean;
  /** Present when ok. */
  result?: unknown;
  /** Present when not ok. Safe to surface to the client. */
  errorMessage?: string;
}

export interface ExecutionDeps {
  scopeMap: ScopeMap;
  sink: AuditSink;
  /** Absent = rate limiting disabled. */
  rateLimiter?: RateLimiter;
}

/**
 * The one code path through which every tool call goes (hard rule: every
 * tool call MUST produce an audit event). Order:
 *
 *   RBAC (deny-by-default) → rate limit → handler
 *   → audit event (ok | error | denied | rate_limited)
 *
 * RBAC runs first so a caller without the required scope always gets the
 * scope-denial message and never consumes rate-limit budget.
 *
 * The audit write is not best-effort: if the sink fails, the event is dumped
 * to stderr as a last resort and the call is reported as failed, so a broken
 * audit pipeline is loud, not silent.
 */
export async function executeTool(
  tool: ToolDefinition,
  args: unknown,
  ctx: ToolContext,
  grantedScopes: readonly string[],
  deps: ExecutionDeps,
): Promise<ExecutionResult> {
  const startedAt = performance.now();

  const emit = async (status: AuditEvent['status']): Promise<boolean> => {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      actor: ctx.actor,
      tool: tool.name,
      argsHash: hashArgs(args),
      status,
      latencyMs: Math.round(performance.now() - startedAt),
      traceId: ctx.traceId,
      sessionId: ctx.sessionId,
    };
    try {
      await deps.sink.write(event);
      return true;
    } catch (sinkError) {
      process.stderr.write(
        `${JSON.stringify({ auditSinkFailure: String(sinkError), droppedEvent: event })}\n`,
      );
      return false;
    }
  };

  if (!isToolAllowed(deps.scopeMap, tool.name, grantedScopes)) {
    await emit('denied');
    return {
      ok: false,
      errorMessage: `Insufficient scope for tool "${tool.name}" (requires: ${
        tool.requiredScopes.join(', ') || 'unmapped — tool is not callable'
      }).`,
    };
  }

  if (deps.rateLimiter) {
    const rateLimit = deps.rateLimiter.check(ctx.actor, tool);
    if (!rateLimit.allowed) {
      await emit('rate_limited');
      return {
        ok: false,
        errorMessage: `Rate limit exceeded for tool "${tool.name}" — retry in ${
          rateLimit.retryAfterSeconds
        }s.`,
      };
    }
  }

  try {
    const result = await tool.handler(args, ctx);
    const audited = await emit('ok');
    if (!audited) {
      return { ok: false, errorMessage: 'Tool executed but audit sink is unavailable.' };
    }
    return { ok: true, result };
  } catch (error) {
    await emit('error');
    return {
      ok: false,
      errorMessage: `Tool "${tool.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
