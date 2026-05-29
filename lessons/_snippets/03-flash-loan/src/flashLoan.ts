import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { signAndExecute, type SandboxConfig, type SandboxConfigWithBM } from './sandbox.js';

// DEEP uses a 1e6 scalar on-chain. The deepbook SDK's `borrowBaseAsset` takes a
// HUMAN amount and scales it internally, but the on-chain `borrow_quantity` it
// records — which our Move module must repay EXACTLY — is the scaled u64. So the
// `borrow_amount` we hand to `execute_base` is the same human amount scaled here.
const DEEP_SCALAR = 1_000_000;

export interface ArbArgs {
  poolKey: 'DEEP_SUI';
  /** Human DEEP amount to borrow (and repay exactly). */
  borrow: number;
  /** Published arb_executor package id (from deployment.json). */
  arbExecutorPackageId: string;
  /**
   * Human DEEP amount to top up with. Defaults to `borrow` so the merged coin
   * covers the principal exactly. Set to 0 to simulate no arb profit.
   */
  topup?: number;
  /**
   * For testing: demand MORE repayment than was borrowed → triggers ERepayShort.
   * When set, the `borrow_amount` arg passed to `execute_base` is this value
   * (scaled), not the actual borrow amount. Because the merged coin equals only
   * what was borrowed + topup, demanding a larger repayment makes
   * `execute_base`'s `assert!(topup.value() >= borrow_amount)` fail (ERepayShort)
   * and the whole PTB reverts.
   */
  overrideBorrowAmount?: number;
}

/**
 * Pattern E — atomic flash loan via DeepBook's hot-potato, settled in one PTB.
 *
 * The PTB:
 *   1. `borrowBaseAsset` borrows `borrow` DEEP from the DEEP_SUI pool and hands
 *      back `[coin, flashLoan]` — the borrowed coin plus the `FlashLoan` hot
 *      potato (a value with no abilities that MUST be consumed this tx).
 *   2. We mint a `topup` coin from the wallet (the stand-in for arb profit).
 *   3. `arb_executor::execute_base` merges topup+borrowed, splits off exactly
 *      the principal, repays via `pool::return_flashloan_base` (which consumes
 *      the potato), and transfers the remainder back to us.
 *
 * If the merged coin can't cover the principal, the Move module aborts
 * (`ERepayShort`), so the whole PTB reverts — the pool's liquidity is never at
 * risk. Over-repaying also reverts (the vault asserts exact-principal return).
 */
export async function runFlashLoanArb(ctx: SandboxConfig, a: ArbArgs): Promise<string> {
  const { client, keypair, manifest } = ctx;

  const deepType = manifest.pools.DEEP_SUI.baseCoinType;
  const suiType = '0x2::sui::SUI';
  const poolId = manifest.pools.DEEP_SUI.poolId;

  const borrowScaled = Math.round(a.borrow * DEEP_SCALAR);
  const topupScaled = Math.round((a.topup ?? a.borrow) * DEEP_SCALAR);
  // When overrideBorrowAmount is set we tell the Move module to demand a repayment
  // LARGER than what was actually borrowed. The actual borrow (borrowScaled) is
  // unchanged; only the repay assertion inside execute_base sees the inflated value.
  const repayScaled =
    a.overrideBorrowAmount !== undefined
      ? Math.round(a.overrideBorrowAmount * DEEP_SCALAR)
      : borrowScaled;

  const tx = new Transaction();

  // borrowBaseAsset is a thunk: it returns the [coin, flashLoan] NestedResults.
  const [coin, flashLoan] = tx.add(client.deepbook.flashLoans.borrowBaseAsset(a.poolKey, a.borrow));

  // The top-up coin (DEEP) merged in to guarantee exact-principal repayment.
  const topup = coinWithBalance({ type: deepType, balance: BigInt(topupScaled) });

  tx.moveCall({
    target: `${a.arbExecutorPackageId}::arb_executor::execute_base`,
    typeArguments: [deepType, suiType],
    arguments: [tx.object(poolId), coin, flashLoan, topup, tx.pure.u64(repayScaled)],
  });

  const res = await signAndExecute(client, keypair, tx);
  return res.digest;
}

/**
 * Pre-seed the pool's lendable base liquidity by depositing DEEP via a BalanceManager.
 *
 * Sandbox-determinism helper: the shared DEEP_SUI vault's lendable DEEP fluctuates with
 * the live market maker; a production pool already holds deep liquidity, so real
 * integrations skip this step entirely.
 *
 * Depositing raises `base_balance` in the vault, which is exactly the value that
 * `borrow_flashloan_base` checks (`assert!(self.base_balance.value() >= borrow_quantity)`).
 * After this call the borrow in `runFlashLoanArb` will reliably succeed regardless of
 * whatever the market maker has done to the vault balance.
 */
export async function seedPoolBaseLiquidity(
  ctx: SandboxConfigWithBM,
  poolKey: 'DEEP_SUI',
  deepAmount: number,
): Promise<string> {
  const tx = new Transaction();
  ctx.client.deepbook.balanceManager.depositIntoManager(ctx.balanceManagerKey, 'DEEP', deepAmount)(tx);
  return (await signAndExecute(ctx.client, ctx.keypair, tx)).digest;
}
