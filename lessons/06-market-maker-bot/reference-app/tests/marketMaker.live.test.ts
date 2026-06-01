import { describe, it, expect, beforeAll } from 'vitest';
import { setupWithBalanceManager, assertSandboxUp, type SandboxConfigWithBM } from '../src/sandbox.js';
import { quoteTwoSidedGrid, stakeDeep, listOpenOrders, cancelAll } from '../src/marketMaker.js';

describe('04-market-maker (live sandbox)', () => {
  let ctx: SandboxConfigWithBM;

  beforeAll(async () => {
    await assertSandboxUp();
    ctx = await setupWithBalanceManager();
  }, 60_000);

  it('places a two-sided grid then cancels it', async () => {
    await quoteTwoSidedGrid(ctx, { poolKey: 'DEEP_SUI', levels: 2, spreadBps: 500, sizePerLevel: 10, depositSui: 20, depositDeep: 200 });
    const open = await listOpenOrders(ctx, 'DEEP_SUI');
    expect(open.length).toBe(4); // 2 bids + 2 asks
    await cancelAll(ctx, 'DEEP_SUI');
    expect((await listOpenOrders(ctx, 'DEEP_SUI')).length).toBe(0);
  });

  it('stakes DEEP for fee rebates', async () => {
    const digest = await stakeDeep(ctx, { poolKey: 'DEEP_SUI', amount: 10, depositDeep: 50 });
    expect(digest).toMatch(/^[A-Za-z0-9]+$/);
    // Confirm the stake actually landed: account() reports the BM's stake split
    // across active_stake (effective next epoch) and inactive_stake (this epoch,
    // where a fresh stake lands). Sum both so the assertion is epoch-agnostic.
    const info = await ctx.client.deepbook.account('DEEP_SUI', ctx.balanceManagerKey);
    expect(info.active_stake + info.inactive_stake).toBeGreaterThan(0);
  });
});
