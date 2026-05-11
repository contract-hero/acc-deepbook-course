# Section 3 — Order book traversal

A pool's `asks` and `bids` aren't inline arrays. They're `BigVector<Order>` — dynamic-field-backed structures that store their elements in slices. To enumerate them you have to walk the slice tree via `suix_getDynamicFields`, then read each slice's content via `sui_getObject`.

This section implements that traversal.

## What you'll write

Extend `src/dataLayer.ts` with:

- `traverseBigVector(rpcUrl, bigVectorMeta)` — calls `suix_getDynamicFields` to list slice IDs, then loops through each slice with `sui_getObject` and yields its `Order[]`. Skip deleted slices silently — the sandbox prunes them aggressively and a 404 on one slice is normal.
- A helper that consumes each `Order` from the traversal and produces a `{ price, qty }` pair. **Use the price from the companion `OrderInfo` event** when available; fall back to decoding `order_id` only when the event is missing.

## The key moment

**The `order_id` bit encoding.**

`order_id: u128` packs three things:

- **Bit 127** — `is_ask` flag (1 = ask, 0 = bid).
- **Bits 64–126** — `price` scaled by `tick_size`.
- **Bits 0–63** — sequence number (monotonic; not useful for display).

The decoder for an ask is:

```ts
const isAsk = (orderId >> 127n) === 1n;
const scaledPrice = (orderId >> 64n) & ((1n << 63n) - 1n);
const price = Number(scaledPrice) * Number(tick_size);
```

The decoder for a bid is **NOT** the obvious mirror. Bid prices are inverted in the on-chain encoding (the contract sorts bids descending by storing them ascending by `MAX - price`). That's the bug bait — naïvely applying the ask decoder to bid order_ids gives you nonsense prices.

The robust path is: **prefer the price field from `OrderInfo` events.** Every order placement emits an `OrderInfo` event with a `price: string` field that's already in display units. The data layer joins each `Order` to its companion event and uses that price; only when an event is missing does it fall back to decoding.

This is the single piece you should write yourself. Get the join right and bid prices are correct; get it wrong and your dashboard shows nonsense for half the order book.

## Verification

- `pnpm vitest run tests/marketStats.test.ts` (later, after section 4) implicitly checks this end-to-end. If bid prices come back wrong, mid price and spread will both go negative.
- During development, `pnpm dev` against a live sandbox shows the rendered prices; they should match what `sui client transaction-block --transaction <pool-deposit-tx>` reports.
