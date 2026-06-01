# Section 5 — Drive it, and prove the slippage guard

The core is done. Now wire it into the minimal smoke driver and run the live suite — including the test that proves `minOut` is *real on-chain protection*, not a client-side nicety.

## What you'll write

`src/App.tsx` + `src/main.tsx` — a one-button UI that calls `setupSandbox()`, runs `swapQuoteForBase({ poolKey: 'DEEP_SUI', amount: 0.1, minOut: 0 })`, and renders the returned `digest` and `baseOut`. It's deliberately thin: the smoke driver exists to *see* a swap happen, not to be a product.

Then run the gate:

```bash
pnpm vitest run
```

## The key moment

**The revert test asserts MoveAbort code `12`, not just "it threw".**

The second live test sends a swap with an impossible `minOut` and asserts the *specific* failure:

```ts
const err = await swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 1_000_000 })
  .then(() => null).catch((e) => e as Error);
expect(err).not.toBeNull();
expect(String(err?.message ?? err)).toMatch(/abort code: 12|EMinimumQuantityOutNotMet/);
```

Abort code `12` is `deepbook::pool::EMinimumQuantityOutNotMet`. Matching it (rather than accepting any thrown error) is what proves the guard fired *on-chain in the pool* — a network blip or a typo would also "throw", but only the real slippage check produces code 12. That distinction is the lesson: `minOut` protects you at the matching engine, where it counts.

**On the warmup retry.** The first test retries the swap up to 10× when `baseOut === 0`. A freshly-deployed sandbox market-maker can have a momentarily-empty ask book; production pools hold standing liquidity, so this loop is a sandbox artifact, not something real integrations need.

## Verification

`pnpm vitest run` — both tests green:
1. `swaps SUI for DEEP ... returns a positive base out`
2. `reverts when minOut is unsatisfiable`

This is the lesson's `final_verification`. It runs against the live sandbox, so the prerequisite probes must have brought the stack up first.
