import { describe, it, expect, beforeAll } from 'vitest';
import { setupSandbox, assertSandboxUp } from '../src/sandbox.js';
import { swapQuoteForBase } from '../src/swap.js';

describe('01-swap (live sandbox)', () => {
  beforeAll(async () => { await assertSandboxUp(); });

  it('swaps SUI for DEEP on DEEP_SUI and returns a positive base out', async () => {
    const ctx = await setupSandbox();
    // The sandbox market-maker seeds asks continuously; right after a (re)deploy the
    // ask book can be momentarily empty, yielding a 0-fill swap. Retry until the book
    // has liquidity. Production pools hold standing liquidity, so real swaps don't need this.
    let res = await swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 0 });
    for (let i = 0; i < 10 && res.baseOut === 0; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 0 });
    }
    expect(res.digest).toMatch(/^[A-Za-z0-9]+$/);
    expect(res.baseOut).toBeGreaterThan(0);
  }, 60_000); // generous timeout for warmup retries

  it('reverts when minOut is unsatisfiable', async () => {
    const ctx = await setupSandbox();
    await expect(
      swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 1_000_000 }),
    ).rejects.toThrow();
  });
});
