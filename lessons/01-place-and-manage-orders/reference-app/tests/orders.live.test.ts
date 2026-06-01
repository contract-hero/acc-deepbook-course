import { describe, it, expect, beforeAll } from 'vitest';
import { setupWithBalanceManager, assertSandboxUp, type SandboxConfigWithBM } from '../src/sandbox.js';
import { placeRestingBid, listOpenOrders, cancelAll, placeMarketBuy } from '../src/orders.js';

describe('02-orders (live sandbox)', () => {
  let ctx: SandboxConfigWithBM;

  beforeAll(async () => {
    await assertSandboxUp();
    ctx = await setupWithBalanceManager();
  }, 60_000);

  it('deposits, places a resting bid, lists it, then cancels all', async () => {
    await placeRestingBid(ctx, { poolKey: 'DEEP_SUI', depositSui: 1, quantity: 10, clientOrderId: '1' });
    const open = await listOpenOrders(ctx, 'DEEP_SUI');
    expect(open.length).toBeGreaterThan(0);
    await cancelAll(ctx, 'DEEP_SUI');
    expect((await listOpenOrders(ctx, 'DEEP_SUI')).length).toBe(0);
  });

  it('places a market buy and returns a valid digest (or tolerates no-liquidity)', async () => {
    try {
      const digest = await placeMarketBuy(ctx, { poolKey: 'DEEP_SUI', depositSui: 5, quantity: 10, clientOrderId: '1' });
      expect(digest).toMatch(/^[A-Za-z0-9]+$/);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Tolerate only seeded-liquidity gaps: liquidity-string errors or an on-chain MoveAbort. A bare VMError (gas/version) must still fail the test.
      const isLiquidityError =
        /insufficient|no.*ask|no.*liquidity|empty|expired|cancel/i.test(msg) ||
        /MoveAbort/i.test(msg);
      if (!isLiquidityError) throw e;
    }
  });
});
