# Section 2 — Compute the grid around mid

A maker that only quotes one side isn't a maker — it's a directional bet. The job is to post a **bid** and an **ask** at each level, symmetric around the current mid price, so you earn the spread when both sides fill. First you have to *know* mid, then lay out the ladder.

## What you'll write

The first half of `quoteTwoSidedGrid(ctx, a)` in `src/marketMaker.ts` — fund the BM, read mid, and compute each level's bid/ask prices:

```ts
// Deposit inventory so the BM can back both sides.
const dep = new Transaction();
client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'SUI', a.depositSui)(dep);
client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'DEEP', a.depositDeep)(dep);
await signAndExecute(client, keypair, dep);

const mid = await withRetry(() => client.deepbook.midPrice(a.poolKey));

for (let i = 1; i <= a.levels; i++) {
  const off = (a.spreadBps / 10_000) * i;
  const bid = round(mid * (1 - off));   // below mid
  const ask = round(mid * (1 + off));   // above mid
  // …place a bid and an ask at this level (Section 3)
}
```

## The key moment

**A symmetric ladder around mid, every price snapped to the tick.**

```ts
const TICK = 0.000001;                       // DEEP_SUI tick size (6 dp)
const round = (p: number) => Math.floor(p / TICK) * TICK;
```

Three details that the pool will not forgive:

1. **Read mid through `withRetry`.** `client.deepbook.midPrice` runs a `SimulateTransaction` under the hood, and the sandbox gRPC node occasionally returns without `commandResults` (surfacing as "Cannot read properties of undefined"). A handful of retries with backoff rides out node-warmup blips — a sandbox artifact, not something production needs.
2. **Symmetric offsets.** Level `i` sits `(spreadBps / 10_000) * i` away from mid on *each* side. Level 1 is closest, level N furthest. Bid below, ask above — that symmetry is what makes it two-sided quoting rather than a lopsided lean.
3. **Round to the tick.** `round()` floors each price to a multiple of `TICK`. Hand the pool a price that isn't tick-aligned and the order is rejected. The half-spread (`spreadBps = 500` → 5%) is also deliberately wide enough to clear the sandbox's seeded quotes — too tight and POST_ONLY rejects every leg (Section 3).

## Verification

No isolated test — the grid is exercised end-to-end by the live suite. If `withRetry` exhausts its attempts, mid never resolves and the quote call throws before any order is placed.
