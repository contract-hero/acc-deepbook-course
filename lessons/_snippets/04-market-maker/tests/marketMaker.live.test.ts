import { describe, it, expect, beforeAll } from 'vitest';
import { setupWithBalanceManager, assertSandboxUp } from '../src/sandbox.js';
import { quoteTwoSidedGrid, stakeDeep, listOpenOrders, cancelAll } from '../src/marketMaker.js';

describe('04-market-maker (live sandbox)', () => {
  beforeAll(async () => { await assertSandboxUp(); });

  it('places a two-sided grid then cancels it', async () => {
    const ctx = await setupWithBalanceManager();
    await quoteTwoSidedGrid(ctx, { poolKey: 'DEEP_SUI', levels: 2, spreadBps: 500, sizePerLevel: 10, depositSui: 20, depositDeep: 200 });
    const open = await listOpenOrders(ctx, 'DEEP_SUI');
    expect(open.length).toBe(4); // 2 bids + 2 asks
    await cancelAll(ctx, 'DEEP_SUI');
    expect((await listOpenOrders(ctx, 'DEEP_SUI')).length).toBe(0);
  });

  it('stakes DEEP for fee rebates', async () => {
    const ctx = await setupWithBalanceManager();
    const digest = await stakeDeep(ctx, { poolKey: 'DEEP_SUI', amount: 10, depositDeep: 50 });
    expect(digest).toMatch(/^[A-Za-z0-9]+$/);
  });
});
