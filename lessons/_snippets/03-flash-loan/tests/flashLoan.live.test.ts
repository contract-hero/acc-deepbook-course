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
    // Pre-seed the pool vault so both tests can borrow reliably.
    // The shared DEEP_SUI vault's base_balance fluctuates with the sandbox market
    // maker and can drop below any fixed borrow amount, causing ENotEnoughBaseForLoan.
    // Depositing via a BalanceManager raises vault.base_balance, which is exactly
    // what borrow_flashloan_base checks. Production pools already hold deep
    // liquidity so real flash-loan integrations don't need this step.
    await seedPoolBaseLiquidity(ctx, 5);
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
    await expect(
      runFlashLoanArb(ctx, {
        poolKey: 'DEEP_SUI',
        borrow: 0.5,
        arbExecutorPackageId: pkg,
        topup: 0,
        overrideBorrowAmount: 1, // demand 1 DEEP repay on a 0.5 borrow → ERepayShort
      }),
    ).rejects.toThrow();
  });
});
