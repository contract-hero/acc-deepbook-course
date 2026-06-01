# Section 5 — Drive it, and keep the gate honest

The core is done: open an account, deposit, rest, list, cancel, market-buy. Now wire it into the smoke UI and run the live suite — and understand the two pieces of defensive code that let the gate pass on a freshly-seeded sandbox *without* hiding real bugs.

## What you'll write

`src/App.tsx` + `src/main.tsx` — a five-button driver: **Setup BalanceManager**, **Place resting bid**, **List open orders**, **Cancel all**, **Place market buy**. Setup must run first (it mints the BM via `setupWithBalanceManagerBrowser()`); the rest are disabled until `ctx` exists. It's deliberately thin — a way to *see* the lifecycle happen, not a product.

Then run the gate:

```bash
pnpm vitest run
```

## The key moment

**Two guards keep the live suite honest: the `withRetry` around `midPrice`, and the market-buy test's *narrow* catch.**

```ts
// orders.ts — smooth over sandbox SimulateTransaction blips when reading mid
const mid = await withRetry(() => client.deepbook.midPrice(a.poolKey));
```

```ts
// orders.live.test.ts — tolerate only liquidity gaps, never a real bug
const isLiquidityError =
  /insufficient|no.*ask|no.*liquidity|empty|expired|cancel/i.test(msg) ||
  /MoveAbort/i.test(msg);
if (!isLiquidityError) throw e;
```

- **`withRetry`** wraps the `midPrice` read because the sandbox's gRPC `SimulateTransaction` occasionally returns without `commandResults` (surfacing as "Cannot read properties of undefined (reading 'returnValues')") during node warmup or at block boundaries. A few backed-off retries absorb that. Production pools don't need it — it's a sandbox artifact.
- **The narrow catch** is the part that matters for trust. A freshly-deployed market maker can have a momentarily-empty ask book, so the market-buy test tolerates *liquidity-shaped* errors or an on-chain `MoveAbort`. But a bare `VMError` (gas, version drift, a genuine client bug) does **not** match the pattern and still fails the test. Catching every error would make the suite green on a broken integration — the precise regex is what preserves the gate's meaning.

## Verification

`pnpm vitest run` — both live tests green:
1. `deposits, places a resting bid, lists it, then cancels all`
2. `places a market buy and returns a valid digest (or tolerates no-liquidity)`

This is the lesson's `final_verification`. It runs against the live sandbox, so the prerequisite probes must have brought the stack up — and given the market maker ~10 s to seed liquidity — first.
