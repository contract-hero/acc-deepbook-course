# Section 5 — Fills pagination + 24h aggregation

The order book gives you a snapshot. To compute **last price**, **24h volume**, and the **sparkline**, you need the recent fills — actual trades, not resting orders.

DeepBook emits an `OrderInfo` event for every placement; if the order trades against existing liquidity, the event carries one or more `RawFillEntry` records under `fills[]`. Fetch them via `suix_queryEvents` and aggregate.

## What you'll write

Two files:

- `src/fillFetcher.ts` — `fetchFills(rpcUrl, packageId, poolId, sinceMs)`. Pages backwards through `suix_queryEvents` with `eventType = "${packageId}::book::OrderInfo"` and a descending sort, flattens each event's `fills[]` into a list, and stops when either condition trips.
- `src/fillAggregator.ts` — pure functions over the resulting `Fill[]`:
  - `volume24h(fills, nowMs)` — sum of `base_quantity` for fills within `nowMs - 86_400_000`.
  - `lastPrice(fills)` — the most recent fill's price (descending sort means `fills[0]`).
  - `sparkline(fills)` — last 50 prices, trimmed to 4 decimals, oldest first.

## The key moment

**Pagination stop conditions.**

`suix_queryEvents` doesn't know what "24h ago" means; if you don't tell it when to stop, it'll happily walk back through every event the sandbox has ever emitted. You need **two** independent bail-outs:

```ts
const oldest_acceptable_ts = nowMs - 24 * 60 * 60 * 1000;
const MAX_FILLS = 50;

while (cursor && fills.length < MAX_FILLS) {
  const page = await rpc('suix_queryEvents', { ... cursor, descending: true });
  for (const ev of page.data) {
    const ts = Number(ev.timestampMs ?? ev.parsedJson.timestamp);
    if (ts < oldest_acceptable_ts) return fills;          // (1) age bound
    fills.push(...ev.parsedJson.fills);
    if (fills.length >= MAX_FILLS) return fills;          // (2) count bound
  }
  cursor = page.nextCursor;
  if (!page.hasNextPage) break;
}
```

Whichever condition trips first wins. Without (1) a quiet sandbox makes you fetch forever; without (2) a busy pool wedges the page on a single noisy minute.

The test (T-013) writes a fake `rpc` that returns the same page over and over and asserts your fetcher never makes more than the expected number of calls. If you forget one of the bail-outs the test hangs — that's the signal.

## Verification

`pnpm vitest run tests/fillFetcher.test.ts tests/fillAggregator.test.ts` — 7 tests across both files.
