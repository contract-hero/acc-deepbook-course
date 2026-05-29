import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { setupSandbox, assertSandboxUp } from '../src/sandbox.js';
import { runFlashLoanArb } from '../src/flashLoan.js';

const pkg = JSON.parse(
  await readFile(new URL('../deployment.json', import.meta.url), 'utf8'),
).arbExecutorPackageId as string;

describe('03-flash-loan (live sandbox)', () => {
  beforeAll(async () => {
    await assertSandboxUp();
  });

  it('borrows DEEP, executes the arb step, repays in one PTB', async () => {
    const ctx = await setupSandbox();
    const digest = await runFlashLoanArb(ctx, {
      poolKey: 'DEEP_SUI',
      borrow: 1,
      arbExecutorPackageId: pkg,
    });
    expect(digest).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('reverts the whole PTB when repayment is short', async () => {
    const ctx = await setupSandbox();
    await expect(
      runFlashLoanArb(ctx, {
        poolKey: 'DEEP_SUI',
        borrow: 1,
        arbExecutorPackageId: pkg,
        topup: 0,
        overrideBorrowAmount: 2,
      }),
    ).rejects.toThrow();
  });
});
