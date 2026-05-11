# Section 4 — Market stats math

With the order book in memory (asks and bids as `{ price, qty }[]` lists, both already sorted), the rest is pure computation. No I/O, no React — just functions that take an order book and return numbers.

## What you'll write

`src/marketStats.ts` exports `computeMarketStats(asks, bids)` returning:

- `midPrice` — `(best_bid + best_ask) / 2`. Undefined when either side is empty.
- `spread` — `best_ask - best_bid`. Undefined when either side is empty.
- `depthWithinOnePercent` — sum of `qty` across both sides where `best_bid * 0.99 ≤ price ≤ best_ask * 1.01`.

All three return `undefined` when their inputs can't support a meaningful answer (one-sided books, empty book). The PoolCard component renders `—` for undefined values — don't try to "fix" an empty book by returning 0; the sentinel matters for the UI.

## The key moment

**The depth-within-1% boundary.**

It's tempting to write:

```ts
// WRONG
depth = asks.filter(a => a.price <= midPrice * 1.01).reduce(...)
     + bids.filter(b => b.price >= midPrice * 0.99).reduce(...)
```

That looks symmetric but it's measuring two slightly different bands — `midPrice * 1.01` is **not** the same as `best_ask * 1.01` once spread is wide. The depth metric is supposed to measure liquidity *near the touch*, so the correct boundary uses the **best price on each side**:

```ts
const askCutoff = best_ask * 1.01;
const bidCutoff = best_bid * 0.99;
const askDepth = asks.filter(a => a.price <= askCutoff).reduce((s, a) => s + a.qty, 0);
const bidDepth = bids.filter(b => b.price >= bidCutoff).reduce((s, b) => s + b.qty, 0);
return askDepth + bidDepth;
```

This is what tests T-006 through T-008 lock in — get the boundary wrong and you'll see "1% depth" values that drift up dramatically when spread widens. The bug only shows up under stress conditions, which is exactly when you most need the metric to be honest.

## Verification

`pnpm vitest run tests/marketStats.test.ts` — 4 tests cover mid, spread, depth, and the one-sided-book sentinels.
