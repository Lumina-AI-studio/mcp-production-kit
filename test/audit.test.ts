import { describe, expect, it } from 'vitest';
import { hashArgs } from '../src/audit/index.js';

describe('audit args hashing', () => {
  it('is deterministic regardless of key order', () => {
    expect(hashArgs({ a: 1, b: { c: [1, 2] } })).toBe(hashArgs({ b: { c: [1, 2] }, a: 1 }));
  });

  it('distinguishes different args', () => {
    expect(hashArgs({ amount: 100 })).not.toBe(hashArgs({ amount: 101 }));
  });

  it('never contains the raw argument values', () => {
    const secret = 'iban-DE89370400440532013000';
    const hash = hashArgs({ iban: secret });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
  });
});
