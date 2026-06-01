import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { OrderType, SelfMatchingOptions } from '@mysten/deepbook-v3';
import { signAndExecute, type SandboxConfig, type SandboxConfigWithBM } from './sandbox.js';

// DEEP uses a 1e6 scalar on-chain. The deepbook SDK's `borrowBaseAsset` takes a
// HUMAN amount and scales it internally, but the on-chain `borrow_quantity` it
// records — which our Move module must repay EXACTLY — is the scaled u64. So the
// `borrow_amount` we hand to `execute_base` is the same human amount scaled here.
const DEEP_SCALAR = 1_000_000;
const TICK = 0.000001; // DEEP_SUI tick size: 0.000001 SUI per DEEP

/** Retry a simulate-based read (e.g. midPrice). The sandbox gRPC SimulateTransaction
 *  endpoint occasionally returns without commandResults; a few retries with a short
 *  backoff smooth over node-warmup / block-boundary blips. */
async function withRetry<T>(fn: () => Promise<T>, retries = 15, delayMs = 1000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, delayMs)); }
  }
  throw lastErr;
}

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
 * Pre-seed the pool's lendable base liquidity so the flash-loan borrow can't hit
 * `ENotEnoughBaseForLoan` on a freshly-deployed sandbox.
 *
 * `borrow_flashloan_base` lends from the pool vault's `base_balance` — the *physical*
 * base coin escrowed inside the pool (`assert!(self.base_balance.value() >= borrow_quantity)`).
 * A plain `depositIntoManager` only credits the BalanceManager, which does NOT touch the
 * vault — so depositing alone never raises borrowable base. The only way to move base into
 * the vault is to escrow it there via an order: when you place an *ask* (sell base), the
 * pool's `settle_balance_manager` pulls that base out of your BM and `join`s it into
 * `vault.base_balance`.
 *
 * So: deposit `deepAmount` DEEP into the BM, then rest a DEEP ask far above mid (POST_ONLY,
 * so it's guaranteed to rest and never fill). That escrows `deepAmount` DEEP into the vault
 * and keeps it there for the life of the suite, making the borrow succeed deterministically
 * regardless of what the sandbox market maker does to the pool.
 *
 * Sandbox-determinism helper: production DEEP_SUI pools already hold deep standing
 * liquidity, so real flash-loan integrations skip this step entirely.
 */
export async function seedPoolBaseLiquidity(
  ctx: SandboxConfigWithBM,
  deepAmount: number,
): Promise<string> {
  const { client, keypair, balanceManagerKey } = ctx;

  // 1. Fund the BM with the DEEP we're about to escrow into the pool vault.
  const dep = new Transaction();
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'DEEP', deepAmount)(dep);
  await signAndExecute(client, keypair, dep);

  // 2. Rest a DEEP ask well above mid. POST_ONLY guarantees it rests (never crosses),
  //    and pricing it at 2× mid means no one fills it — so the escrowed DEEP stays in
  //    vault.base_balance, lendable to the flash loan.
  const mid = await withRetry<number>(() => client.deepbook.midPrice('DEEP_SUI'));
  const askPrice = Math.ceil((mid * 2) / TICK) * TICK;
  const tx = new Transaction();
  client.deepbook.deepBook.placeLimitOrder({
    poolKey: 'DEEP_SUI',
    balanceManagerKey,
    clientOrderId: '0', // numeric string — the SDK serializes this as u64
    price: askPrice,
    quantity: deepAmount,
    isBid: false, // ask: sell DEEP (base) → escrows base into vault.base_balance
    orderType: OrderType.POST_ONLY,
    selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
    payWithDeep: false, // DEEP_SUI is whitelisted — no DEEP fee
  })(tx);
  return (await signAndExecute(client, keypair, tx)).digest;
}
