import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress, normalizeStructTag } from '@mysten/sui/utils';
import { signAndExecute, type SandboxConfig } from './sandbox.js';

export interface SwapArgs {
  poolKey: 'DEEP_SUI' | 'SUI_USDC';
  amount: number;
  minOut: number;
}

export interface SwapResult {
  digest: string;
  baseOut: number;
}

/** Per-pool base-coin scalars (raw u64 units per human unit). DEEP = 1e6 (6 dec), SUI = 1e9 (9 dec). */
const BASE_SCALAR: Record<SwapArgs['poolKey'], number> = {
  DEEP_SUI: 1_000_000,
  SUI_USDC: 1_000_000_000,
};

/**
 * Pattern A — swap over the CLOB without a BalanceManager.
 *
 * `swapExactQuoteForBase` spends `amount` of the pool's quote coin and receives
 * the pool's base coin, operating directly on wallet coins. It returns the
 * three leftover coins `[baseCoin, quoteCoin, deepCoin]` which MUST be
 * transferred back to the sender or they are destroyed at the end of the tx.
 *
 * `minOut` is the slippage guard: if the pool cannot deliver at least `minOut`
 * base coin, the transaction reverts on-chain.
 *
 * `deepAmount` is 0 because both sandbox pools are whitelisted (no DEEP fee).
 */
export async function swapQuoteForBase(ctx: SandboxConfig, args: SwapArgs): Promise<SwapResult> {
  const { client, keypair, address, manifest } = ctx;

  const tx = new Transaction();
  const [baseCoin, quoteCoin, deepCoin] = tx.add(
    client.deepbook.deepBook.swapExactQuoteForBase({
      poolKey: args.poolKey,
      amount: args.amount,
      deepAmount: 0,
      minOut: args.minOut,
    }),
  );
  tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);

  const result = await signAndExecute(client, keypair, tx);

  // Compute the real base-coin received: the positive balanceChange of the
  // pool's base coin type credited to our address, converted from the chain
  // u64 (with leading "0x" type normalized) to human units via the coin scalar.
  const baseCoinType = manifest.pools[args.poolKey].baseCoinType;
  const scalar = BASE_SCALAR[args.poolKey];

  const baseOut = baseDelta(result, baseCoinType, address) / scalar;

  return { digest: result.digest, baseOut };
}

/**
 * Sum the positive balance delta of `coinType` credited to `owner` from a
 * gRPC transaction result's balanceChanges. Coin types are compared using
 * SDK normalization so manifest types match canonicalized on-chain types.
 */
function baseDelta(result: any, coinType: string, owner: string): number {
  const changes: any[] = result?.balanceChanges ?? result?.effects?.balanceChanges ?? [];
  const wantType = normalizeStructTag(coinType);
  const wantOwner = normalizeSuiAddress(owner);
  let total = 0;
  for (const ch of changes) {
    const chType = normalizeStructTag(ch.coinType ?? ch.coin_type ?? '');
    // gRPC BalanceChange has `address` directly; JSON-RPC wraps it in `owner`.
    const chAddr = ch.address
      ? normalizeSuiAddress(ch.address)
      : extractOwner(ch.owner);
    const amount = Number(ch.amount ?? 0);
    if (chType === wantType && (!chAddr || chAddr === wantOwner) && amount > 0) {
      total += amount;
    }
  }
  return total;
}

function extractOwner(owner: any): string | undefined {
  if (!owner) return undefined;
  // gRPC owner shapes: { AddressOwner } | { address } | { addressOwner }
  const addr =
    typeof owner === 'string'
      ? owner
      : owner.AddressOwner ?? owner.addressOwner ?? owner.address ?? owner.owner;
  return addr ? normalizeSuiAddress(addr) : undefined;
}
