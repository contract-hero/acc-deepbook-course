# Section 2 — Deposit, then rest a bid that doesn't fill

You have a funded BalanceManager. Now put it to work: move `SUI` into the BM, then place a limit bid priced low enough that it *rests* on the book instead of matching. A resting order is the thing you'll list and cancel in the next section — so it has to actually rest.

## What you'll write

`placeRestingBid(ctx, args)` in `src/orders.ts`:

```ts
// Step 1: deposit SUI so the BM has funds to lock for the bid
const depositTx = new Transaction();
client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'SUI', a.depositSui)(depositTx);
await signAndExecute(client, keypair, depositTx);

// Step 2: read mid, compute a bid far below it
const mid = await withRetry(() => client.deepbook.midPrice(a.poolKey));
const bidPrice = Math.floor((mid * 0.5) / TICK) * TICK;

// Step 3: place the limit bid (rests on the book)
const orderTx = new Transaction();
client.deepbook.deepBook.placeLimitOrder({
  poolKey: a.poolKey,
  balanceManagerKey,
  clientOrderId: a.clientOrderId,
  price: bidPrice,
  quantity: a.quantity,
  isBid: true,
  orderType: OrderType.NO_RESTRICTION,
  selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
  payWithDeep: false,
})(orderTx);
return (await signAndExecute(client, keypair, orderTx)).digest;
```

## The key moment

**Deposit *before* the order, and price the bid at 50% of mid so it can't cross.**

```ts
const bidPrice = Math.floor((mid * 0.5) / TICK) * TICK;
```

Two decisions carry this whole section:

1. **Funds live in the BM, not your wallet.** `depositIntoManager` moves `SUI` into the BalanceManager first; when you place the bid, DeepBook *locks the exact quote amount the order needs out of the BM*. No deposit → nothing to lock → the order is rejected. This is the Pattern-B contract: trade out of the account, not out of loose coins.
2. **Rest, don't fill.** A bid at or above the mid price would *cross* the book and fill immediately. Pricing at half the mid — snapped down to the pool's `TICK` (`0.000001` SUI/DEEP) with `Math.floor` so it's a valid price level — guarantees it sits on the book unmatched. That's deliberate: Section 3's "list it back, then cancel" only has something to find because the bid is resting.

`OrderType.NO_RESTRICTION` is standard limit behaviour; `payWithDeep: false` because DEEP_SUI is whitelisted (fees come from traded coins).

## Verification

`pnpm vitest run` — the first live test calls `placeRestingBid` then asserts `listOpenOrders(...).length > 0`. If your bid crossed (priced too high) the book shows zero open orders and that assertion fails.
