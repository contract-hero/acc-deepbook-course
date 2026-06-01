# Section 3 — Rest the grid with POST_ONLY

This is the line that separates a maker from a taker. A taker *crosses* the spread and pays a fee. A maker *rests* on the book and collects it. The order type `POST_ONLY` is the on-chain enforcement of that distinction — and it's the heart of this lesson.

## What you'll write

The second half of `quoteTwoSidedGrid` — place a bid and an ask at every level into one PTB, then send it:

```ts
const tx = new Transaction();
let oid = 0;
for (let i = 1; i <= a.levels; i++) {
  const off = (a.spreadBps / 10_000) * i;
  const bid = round(mid * (1 - off));
  const ask = round(mid * (1 + off));

  for (const [price, isBid] of [[bid, true], [ask, false]] as const) {
    client.deepbook.deepBook.placeLimitOrder({
      poolKey: a.poolKey,
      balanceManagerKey,
      clientOrderId: String(++oid),
      price,
      quantity: a.sizePerLevel,
      isBid,
      orderType: OrderType.POST_ONLY,                       // ← the maker line
      selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
      payWithDeep: false,                                   // whitelisted pool
    })(tx);
  }
}
return (await signAndExecute(client, keypair, tx)).digest;
```

## The key moment

**`orderType: OrderType.POST_ONLY` is what guarantees the bot only ever *makes*.**

`POST_ONLY` tells the matching engine: *reject this leg if it would immediately cross and fill.* The order must rest, or it doesn't get placed at all. That's the safety rail of a maker — it can never accidentally cross the spread and become a fee-paying taker, even if your computed price drifts past the opposite side of the book.

Three supporting choices in the same call:

- **`payWithDeep: false`** — the DEEP_SUI sandbox pool is *whitelisted*, so no DEEP fee is charged on placement. On a non-whitelisted pool you'd pay the maker fee in DEEP (which is exactly what staking, Section 4, earns back as rebates).
- **One PTB, all legs.** Every bid and ask is batched into a single transaction — the whole grid posts atomically, so the book never sees a half-placed ladder.
- **Deposit *then* place, in two sends.** The deposit (Section 2) is its own `signAndExecute`, completing before this transaction references the BM's balance — the orders need the inventory already credited.

If your `spreadBps` is too tight, POST_ONLY does its job and *rejects* the crossing legs — you'll see fewer than `levels * 2` resting orders. Widen the spread until exactly four rest.

## Verification

`pnpm vitest run` — the first live test places the grid and asserts `listOpenOrders(...).length === 4`. A count below 4 means POST_ONLY rejected a crossing leg (spread too tight) or a price wasn't tick-aligned.
