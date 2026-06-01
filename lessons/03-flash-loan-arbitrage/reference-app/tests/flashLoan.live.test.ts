import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { setupWithBalanceManager, assertSandboxUp, type SandboxConfigWithBM } from '../src/sandbox.js';
import { runFlashLoanArb, seedPoolBaseLiquidity } from '../src/flashLoan.js';

const pkg = JSON.parse(
  await readFile(new URL('../deployment.json', import.meta.url), 'utf8'),
).arbExecutorPackageId as string;

describe('03-flash-loan (live sandbox)', () => {
  let ctx: SandboxConfigWithBM;

  beforeAll(async () => {
    await assertSandboxUp();
    // One shared keypair + BalanceManager across the suite — avoids creating a
    // new BM per test and reduces faucet pressure. The flash-loan helper only
    // reads ctx.client/keypair/manifest (no BM interaction), so sharing is safe.
    ctx = await setupWithBalanceManager();
    // Pre-seed the pool vault so both tests can borrow reliably. The shared
    // DEEP_SUI vault's base_balance fluctuates with the sandbox market maker and
    // can drop below the borrow amount, causing ENotEnoughBaseForLoan. seedPool-
    // BaseLiquidity escrows DEEP into vault.base_balance by resting a DEEP ask —
    // exactly what borrow_flashloan_base lends from. 50 DEEP is comfortably above
    // both the pool's min order size and the 0.5 DEEP borrow. Production pools hold
    // deep liquidity, so real flash-loan integrations don't need this step.
    await seedPoolBaseLiquidity(ctx, 50);
  });

  it('borrows DEEP, executes the arb step, repays in one PTB', async () => {
    const digest = await runFlashLoanArb(ctx, {
      poolKey: 'DEEP_SUI',
      borrow: 0.5,
      arbExecutorPackageId: pkg,
    });
    expect(digest).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('reverts the whole PTB when repayment is short', async () => {
    // Pre-seed ensures the borrow succeeds; the revert comes from ERepayShort
    // (the repay guard inside execute_base), not from ENotEnoughBaseForLoan at
    // the borrow step — otherwise the test would pass for the wrong reason.
    const err = await runFlashLoanArb(ctx, {
      poolKey: 'DEEP_SUI',
      borrow: 0.5,
      arbExecutorPackageId: pkg,
      topup: 0,
      overrideBorrowAmount: 1, // demand 1 DEEP repay on a 0.5 borrow → ERepayShort
    }).then(() => null).catch((e) => e as Error);
    const msg = String(err?.message ?? err);
    // The reverted tx's message carries the aborting module + code, e.g.:
    //   "MoveAbort in 3rd command, abort code: 1, in '0x..::arb_executor::execute_base'"
    // We assert the abort fired inside OUR module's repay guard (ERepayShort),
    // not at the deepbook borrow step (ENotEnoughBaseForLoan, same code 1) — so a
    // liquidity shortfall can't make this negative test pass for the wrong reason.
    expect(err).not.toBeNull();
    expect(msg).toMatch(/arb_executor::execute_base/); // reverted inside execute_base (ERepayShort)…
    expect(msg).not.toMatch(/borrow_flashloan|ENotEnoughBaseForLoan/); // …not at the borrow step
  });
});
