import { describe, it, expect, beforeAll } from 'vitest';
import { setupSandbox, assertSandboxUp } from '../src/sandbox.js';
import { swapQuoteForBase } from '../src/swap.js';

describe('01-swap (live sandbox)', () => {
  beforeAll(async () => { await assertSandboxUp(); });

  it('swaps SUI for DEEP on DEEP_SUI and returns a positive base out', async () => {
    const ctx = await setupSandbox();
    const res = await swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 0 });
    expect(res.digest).toMatch(/^[A-Za-z0-9]+$/);
    expect(res.baseOut).toBeGreaterThan(0);
  });

  it('reverts when minOut is unsatisfiable', async () => {
    const ctx = await setupSandbox();
    await expect(
      swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 1_000_000 }),
    ).rejects.toThrow();
  });
});
