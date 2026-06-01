# Section 5 — Unwind, re-quote, and run the gate

A real market maker doesn't place a grid once and walk away. The market moves, inventory skews, and the quotes go stale — so the bot runs a loop: **cancel the whole book, re-read mid, re-quote.** This section builds the unwind half of that loop, wires the smoke driver, and runs the live gate.

## What you'll write

The reads/cancel helpers in `src/marketMaker.ts`:

```ts
export async function listOpenOrders(ctx: SandboxConfigWithBM, poolKey: 'DEEP_SUI') {
  return ctx.client.deepbook.accountOpenOrders(poolKey, ctx.balanceManagerKey);
}

export async function cancelAll(ctx: SandboxConfigWithBM, poolKey: 'DEEP_SUI') {
  const tx = new Transaction();
  ctx.client.deepbook.deepBook.cancelAllOrders(poolKey, ctx.balanceManagerKey)(tx);
  return (await signAndExecute(ctx.client, ctx.keypair, tx)).digest;
}
```

Then the smoke UI — `src/App.tsx` + `src/main.tsx` — with four buttons: **Setup BalanceManager** (calls `setupWithBalanceManagerBrowser()`), **Start quoting**, **Stake DEEP**, **Cancel all**. It's deliberately thin: the driver exists to *watch* a maker quote and unwind, not to be a product.

## The key moment

**`cancelAllOrders` tears down the entire grid atomically — the foundation of the refresh cycle.**

```ts
ctx.client.deepbook.deepBook.cancelAllOrders(poolKey, ctx.balanceManagerKey)(tx);
```

One call cancels *every* resting leg for this BM in this pool. That atomicity is what makes a re-quote loop safe: you never sit with a half-cancelled book where some stale orders linger while you place fresh ones. The cycle is `cancelAll → midPrice → quoteTwoSidedGrid`, repeated each tick.

The live gate proves the round trip through `accountOpenOrders`:

```ts
await quoteTwoSidedGrid(ctx, { poolKey: 'DEEP_SUI', levels: 2, spreadBps: 500, sizePerLevel: 10, depositSui: 20, depositDeep: 200 });
expect((await listOpenOrders(ctx, 'DEEP_SUI')).length).toBe(4);  // 2 bids + 2 asks rest
await cancelAll(ctx, 'DEEP_SUI');
expect((await listOpenOrders(ctx, 'DEEP_SUI')).length).toBe(0);  // book fully unwound
```

Asserting exactly `4` then `0` is what proves both halves: the grid rested two-sided, and cancel-all cleared all of it.

## Verification

```bash
pnpm vitest run
```

This is the lesson's `final_verification`. Both tests green:
1. `places a two-sided grid then cancels it` — 4 resting orders → cancel → 0.
2. `stakes DEEP for fee rebates` — `active_stake + inactive_stake > 0`.

It runs against the live sandbox, so the prerequisite probes must have brought the stack up first.
