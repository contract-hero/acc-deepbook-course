# DeepBook Market Stats — Chain-Direct

**What you'll build.** A React dashboard that shows live market stats — mid price, bid/ask spread, depth within ±1%, 24h volume, last price, and a sparkline — for every pool deployed on the local DeepBook sandbox. No indexer, no SDK shortcuts; you talk to Sui JSON-RPC directly and decode the order book yourself.

**Why "chain-direct" matters.** Most DeepBook tutorials lean on the indexer at `:9008` or the high-level SDK. This lesson teaches the layer below: how a pool's state actually lives on chain (a `Versioned<PoolInner>` wrapper around a `Book` with `BigVector<Order>` for asks and bids), how to decode an `order_id` to get its price, how `OrderInfo` events are paginated, and how to assemble the pieces into a usable dashboard. By the end you'll understand exactly what the indexer is doing for you when you do reach for it.

**Prerequisites.**
- Working knowledge of React hooks and TypeScript.
- Comfortable reading JSON-RPC request/response shapes.
- *Helpful but not required:* prior exposure to Sui object ownership and shared objects.

**The deliverable.** When you reach the final section, `pnpm vitest run` in your workspace passes the same 24-test suite the reference implementation passes. The test suite is the equivalence gate — your code doesn't have to look like the reference, it just has to behave like it.

**Estimated time.** 90–120 minutes if you write each load-bearing piece yourself in `learning` mode. 30–45 minutes if you pick `explanatory` mode and read along.
