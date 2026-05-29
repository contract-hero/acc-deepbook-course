/**
 * Pattern B — BalanceManager lifecycle + order management.
 *
 * Covers:
 *   placeRestingBid  — deposit SUI, place a limit bid far below mid (rests on book)
 *   listOpenOrders   — query open order IDs for the BalanceManager
 *   cancelAll        — cancel every open order for the BalanceManager
 *   placeMarketBuy   — deposit SUI, execute a market buy (fills immediately)
 *
 * Key concept: every order operation requires a BalanceManager (see sandbox.ts
 * setupWithBalanceManager). The BM acts as escrow — funds are deposited before
 * trading and settled back after fills. DEEP_SUI is whitelisted, so fees are
 * paid from traded coins (payWithDeep: false).
 */

import { OrderType, SelfMatchingOptions } from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { signAndExecute, type SandboxConfigWithBM } from './sandbox.js';

const TICK = 0.000001; // DEEP_SUI tick size: 0.000001 SUI per DEEP

/** Retry a simulate-based read (e.g. midPrice). The sandbox gRPC SimulateTransaction
 *  endpoint occasionally returns without commandResults, surfacing as
 *  "Cannot read properties of undefined (reading 'returnValues')". A few retries
 *  with a short backoff smooth over node-warmup / block-boundary blips. */
async function withRetry<T>(fn: () => Promise<T>, retries = 15, delayMs = 1000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, delayMs)); }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Public interface types
// ---------------------------------------------------------------------------

/** Shared argument shape for order operations (PlaceBidArgs and PlaceMarketBuyArgs are identical). */
export interface OrderArgs {
    poolKey: 'DEEP_SUI';
    depositSui: number;
    quantity: number;
    clientOrderId: string;
}

/** @deprecated Use OrderArgs */
export type PlaceBidArgs = OrderArgs;
/** @deprecated Use OrderArgs */
export type PlaceMarketBuyArgs = OrderArgs;

// ---------------------------------------------------------------------------
// Order operations
// ---------------------------------------------------------------------------

/**
 * Deposit SUI into the BalanceManager, then place a limit BID well below the
 * current mid price so the order rests on the book without filling immediately.
 *
 * The bid price is set at 50% of mid, rounded down to the pool's tick size.
 * Returns the transaction digest of the placeLimitOrder transaction.
 */
export async function placeRestingBid(
    ctx: SandboxConfigWithBM,
    a: OrderArgs,
): Promise<string> {
    const { client, keypair, balanceManagerKey } = ctx;

    // Step 1: deposit SUI so the BM has funds to lock for the bid
    const depositTx = new Transaction();
    client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'SUI', a.depositSui)(depositTx);
    await signAndExecute(client, keypair, depositTx);

    // Step 2: query mid price and compute a bid far enough below to rest
    const mid = await withRetry(() => client.deepbook.midPrice(a.poolKey));
    const bidPrice = Math.floor((mid * 0.5) / TICK) * TICK;

    // Step 3: place the limit bid
    const orderTx = new Transaction();
    client.deepbook.deepBook.placeLimitOrder({
        poolKey: a.poolKey,
        balanceManagerKey,
        clientOrderId: a.clientOrderId,
        price: bidPrice,
        quantity: a.quantity,
        isBid: true,
        orderType: OrderType.NO_RESTRICTION,
        selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
        payWithDeep: false,
    })(orderTx);

    return (await signAndExecute(client, keypair, orderTx)).digest;
}

/**
 * Return the list of open order IDs for the BalanceManager on the given pool.
 * An empty array means no resting orders.
 */
export async function listOpenOrders(
    ctx: SandboxConfigWithBM,
    poolKey: 'DEEP_SUI',
): Promise<string[]> {
    return ctx.client.deepbook.accountOpenOrders(poolKey, ctx.balanceManagerKey);
}

/**
 * Cancel every open order for the BalanceManager on the given pool.
 * Returns the transaction digest of the cancelAllOrders transaction.
 */
export async function cancelAll(
    ctx: SandboxConfigWithBM,
    poolKey: 'DEEP_SUI',
): Promise<string> {
    const tx = new Transaction();
    ctx.client.deepbook.deepBook.cancelAllOrders(poolKey, ctx.balanceManagerKey)(tx);
    return (await signAndExecute(ctx.client, ctx.keypair, tx)).digest;
}

/**
 * Deposit SUI, then place a market BUY that fills immediately against the
 * market maker's resting asks. Returns the transaction digest.
 *
 * Requires the sandbox market maker to have seeded asks on DEEP_SUI.
 * The test tolerates a thrown error if liquidity is absent.
 */
export async function placeMarketBuy(
    ctx: SandboxConfigWithBM,
    a: OrderArgs,
): Promise<string> {
    const { client, keypair, balanceManagerKey } = ctx;

    // Deposit SUI and place the market buy in a single PTB so both commands
    // share the same on-chain context and reduce round-trips.
    const tx = new Transaction();
    client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'SUI', a.depositSui)(tx);
    client.deepbook.deepBook.placeMarketOrder({
        poolKey: a.poolKey,
        balanceManagerKey,
        clientOrderId: a.clientOrderId,
        quantity: a.quantity,
        isBid: true,
        selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
        payWithDeep: false,
    })(tx);

    return (await signAndExecute(client, keypair, tx)).digest;
}
