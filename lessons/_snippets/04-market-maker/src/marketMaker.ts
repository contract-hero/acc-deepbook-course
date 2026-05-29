import { OrderType, SelfMatchingOptions } from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { signAndExecute, type SandboxConfigWithBM } from './sandbox.js';

// DEEP_SUI tick size is 0.000001 (6 decimal places).
const TICK = 0.000001;
const round = (p: number) => Math.floor(p / TICK) * TICK;

export interface GridArgs {
  poolKey: 'DEEP_SUI';
  levels: number;
  /** Half-spread per level, in basis points (e.g. 100 = 1%). */
  spreadBps: number;
  sizePerLevel: number;
  depositSui: number;
  depositDeep: number;
}

/**
 * Deposit inventory into the BalanceManager, then place `levels` POST_ONLY
 * bids and `levels` POST_ONLY asks geometrically spaced around mid price.
 *
 * Each level i is offset by (spreadBps/10_000 * i) from mid, so level 1 is
 * closest to mid and level N is furthest. All orders use POST_ONLY to ensure
 * they rest on the book (rejected if they would immediately cross); if the
 * seeded sandbox quotes are too tight and POST_ONLY rejects, increase
 * spreadBps in the test until exactly `levels * 2` orders rest.
 *
 * DEEP_SUI is a whitelisted pool → payWithDeep:false is correct.
 */
export async function quoteTwoSidedGrid(
  ctx: SandboxConfigWithBM,
  a: GridArgs,
): Promise<string> {
  const { client, keypair, balanceManagerKey } = ctx;

  // Deposit inventory so the BM has balance for both sides.
  const dep = new Transaction();
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'SUI', a.depositSui)(dep);
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'DEEP', a.depositDeep)(dep);
  await signAndExecute(client, keypair, dep);

  const mid = await client.deepbook.midPrice(a.poolKey);

  const tx = new Transaction();
  let oid = 0;
  for (let i = 1; i <= a.levels; i++) {
    const off = (a.spreadBps / 10_000) * i;
    const bid = round(mid * (1 - off));
    const ask = round(mid * (1 + off));

    for (const [price, isBid] of [[bid, true], [ask, false]] as const) {
      client.deepbook.deepBook.placeLimitOrder({
        poolKey: a.poolKey,
        balanceManagerKey,
        clientOrderId: String(++oid),
        price,
        quantity: a.sizePerLevel,
        isBid,
        orderType: OrderType.POST_ONLY,
        selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
        payWithDeep: false,
      })(tx);
    }
  }

  return (await signAndExecute(client, keypair, tx)).digest;
}

export interface StakeArgs {
  poolKey: 'DEEP_SUI';
  amount: number;
  depositDeep: number;
}

/**
 * Stake DEEP in the given pool to qualify for maker fee rebates.
 * Deposits `depositDeep` DEEP into the BalanceManager first so the BM
 * has balance to stake from.
 */
export async function stakeDeep(
  ctx: SandboxConfigWithBM,
  a: StakeArgs,
): Promise<string> {
  const { client, keypair, balanceManagerKey } = ctx;

  const dep = new Transaction();
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'DEEP', a.depositDeep)(dep);
  await signAndExecute(client, keypair, dep);

  const tx = new Transaction();
  client.deepbook.governance.stake(a.poolKey, balanceManagerKey, a.amount)(tx);
  return (await signAndExecute(client, keypair, tx)).digest;
}

/** Return the list of open order IDs for `poolKey` in this BM. */
export async function listOpenOrders(
  ctx: SandboxConfigWithBM,
  poolKey: 'DEEP_SUI',
) {
  return ctx.client.deepbook.accountOpenOrders(poolKey, ctx.balanceManagerKey);
}

/** Cancel all resting orders in `poolKey` for this BM. */
export async function cancelAll(
  ctx: SandboxConfigWithBM,
  poolKey: 'DEEP_SUI',
) {
  const tx = new Transaction();
  ctx.client.deepbook.deepBook.cancelAllOrders(poolKey, ctx.balanceManagerKey)(tx);
  return (await signAndExecute(ctx.client, ctx.keypair, tx)).digest;
}
