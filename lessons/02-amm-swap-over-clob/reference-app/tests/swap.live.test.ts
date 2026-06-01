import { describe, it, expect, beforeAll } from 'vitest';
import { setupSandbox, assertSandboxUp, type SandboxConfig } from '../src/sandbox.js';
import { swapQuoteForBase } from '../src/swap.js';

describe('01-swap (live sandbox)', () => {
  let ctx: SandboxConfig;

  beforeAll(async () => {
    await assertSandboxUp();
    ctx = await setupSandbox();
  }, 60_000);

  it('swaps SUI for DEEP on DEEP_SUI and returns a positive base out', async () => {
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
    const err = await swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 1_000_000 })
      .then(() => null).catch((e) => e as Error);
    // The reverted tx's message carries the aborting module + code, e.g.:
    //   "MoveAbort in 3rd command, abort code: 12, in '0x..::pool::swap_exact_quantity'"
    // Code 12 is deepbook::pool::EMinimumQuantityOutNotMet — the slippage guard —
    // so we assert the revert is the min-out check, not just any throw.
    expect(err).not.toBeNull();
    expect(String(err?.message ?? err)).toMatch(/abort code: 12|EMinimumQuantityOutNotMet/);
  });
});
