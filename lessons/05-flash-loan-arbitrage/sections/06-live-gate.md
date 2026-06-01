# Section 6 — Drive it & prove atomicity

The mechanism is built. Now wire it into the smoke driver and run the live gate — including the test that proves the loan really *unwinds completely* when repayment falls short, rather than leaving the pool half-drained.

## What you'll write

`src/App.tsx` + `src/main.tsx` — a one-button UI that calls `setupSandboxBrowser()`, runs `runFlashLoanArb({ poolKey: 'DEEP_SUI', borrow: 1, arbExecutorPackageId })`, and renders the resulting `digest` (or the revert message). It's deliberately thin: the smoke driver exists to *watch* a flash loan happen, not to be a product.

Then run the gate:

```bash
pnpm vitest run
```

## The key moment

**The revert test asserts *where* the abort fired, not just that it threw.**

The negative test demands a repayment *larger* than what was borrowed, then asserts the failure came from the right place:

```ts
const err = await runFlashLoanArb(ctx, {
  poolKey: 'DEEP_SUI',
  borrow: 0.5,
  arbExecutorPackageId: pkg,
  topup: 0,
  overrideBorrowAmount: 1, // demand 1 DEEP repay on a 0.5 borrow → ERepayShort
}).then(() => null).catch((e) => e as Error);

const msg = String(err?.message ?? err);
expect(err).not.toBeNull();
expect(msg).toMatch(/arb_executor::execute_base/);          // aborted in OUR guard…
expect(msg).not.toMatch(/borrow_flashloan|ENotEnoughBaseForLoan/); // …not at borrow
```

Why so precise? A flash loan can fail at *two* different places, and both surface as a thrown error with the same generic abort code 1:

- at the **borrow** step, if the vault lacks liquidity (`ENotEnoughBaseForLoan`), or
- at the **repay** step, inside your `execute_base` (`ERepayShort`).

Only the second one proves what this lesson is about. By matching `/arb_executor::execute_base/` and *excluding* `/borrow_flashloan|ENotEnoughBaseForLoan/`, the test confirms the borrow *succeeded*, the arb step ran, and then the short repayment reverted the **entire settled PTB** — the borrowed DEEP is back in the pool exactly as if nothing happened. A liquidity shortfall (which the Section 1 pre-seed exists to prevent) would also throw, but it wouldn't prove atomicity.

> **Note: `topup: 0` alone is not enough to force a revert.** The borrowed coin itself equals the principal, so `topup.join(borrowed)` already covers `borrow_amount` and repayment succeeds. You need `overrideBorrowAmount` to *demand more than was borrowed* — that's what makes the merged coin fall short.

That's the lesson: a flash loan either commits completely or unwinds completely. There is no halfway state where the lender is out their principal.

## Verification

`pnpm vitest run` — both tests green:
1. `borrows DEEP, executes the arb step, repays in one PTB` (positive digest)
2. `reverts the whole PTB when repayment is short` (aborts inside `execute_base`)

This is the lesson's `final_verification`. It runs against the live sandbox, so the prerequisite probes must have brought the stack up *and* the `arb_executor` package must already be published (Section 4) so its id is in `deployment.json`.
