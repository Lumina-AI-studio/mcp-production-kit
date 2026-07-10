import { describe, expect, it } from 'vitest';
import { exampleToolSurface } from './example-surface.js';
import { cases } from './cases.js';
import { runEvals } from './harness.js';

const MIN_PASS_RATE = 0.8;

/**
 * Live tool-selection evals against the real Anthropic Messages API.
 * Skipped when ANTHROPIC_API_KEY is unset (e.g. in CI) with a visible
 * skip reason, so this never blocks a keyless pipeline.
 *
 * Run locally with: ANTHROPIC_API_KEY=sk-... ./node_modules/.bin/vitest run test/evals/evals.test.ts
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)(
  'tool-selection evals (live Anthropic API — requires ANTHROPIC_API_KEY)',
  () => {
    it(`passes at least ${MIN_PASS_RATE * 100}% of eval cases`, async () => {
      const summary = await runEvals(exampleToolSurface, cases);
      const passRate = summary.passed / (summary.passed + summary.failed);

      expect(passRate).toBeGreaterThanOrEqual(MIN_PASS_RATE);
    }, 120_000);
  },
);

if (!process.env.ANTHROPIC_API_KEY) {
  console.log(
    '[evals] skipping live tool-selection evals: ANTHROPIC_API_KEY is not set',
  );
}
