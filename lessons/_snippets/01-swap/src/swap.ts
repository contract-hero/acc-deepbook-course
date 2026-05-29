import { Transaction } from '@mysten/sui/transactions';
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
  const scalar = args.poolKey === 'DEEP_SUI' ? 1_000_000 : 1_000_000_000; // DEEP=1e6, SUI=1e9

  const baseOut = baseDelta(result, baseCoinType, address) / scalar;

  return { digest: result.digest, baseOut };
}

/**
 * Sum the positive balance delta of `coinType` credited to `owner` from a
 * gRPC transaction result's balanceChanges. Coin types are compared with
 * leading-zero / "0x" normalization so the manifest type matches the
 * canonicalized on-chain type.
 */
function baseDelta(result: any, coinType: string, owner: string): number {
  const changes: any[] = result?.balanceChanges ?? result?.effects?.balanceChanges ?? [];
  const wantType = normalizeType(coinType);
  let total = 0;
  for (const ch of changes) {
    const chType = normalizeType(ch.coinType ?? ch.coin_type ?? '');
    const chOwner = extractOwner(ch.owner);
    const amount = Number(ch.amount ?? 0);
    if (chType === wantType && (!chOwner || chOwner === normalizeAddr(owner)) && amount > 0) {
      total += amount;
    }
  }
  return total;
}

function normalizeType(t: string): string {
  // Normalize the address portion of each "0x..::module::Name" segment.
  return t
    .split('<')
    .join('<')
    .replace(/0x0*([0-9a-fA-F]+)/g, (_m, hex) => '0x' + hex.toLowerCase());
}

function normalizeAddr(a: string): string {
  return a.replace(/^0x0*/, '0x').toLowerCase();
}

function extractOwner(owner: any): string | undefined {
  if (!owner) return undefined;
  if (typeof owner === 'string') return normalizeAddr(owner);
  // gRPC owner shapes: { AddressOwner } | { address } | { addressOwner }
  const addr = owner.AddressOwner ?? owner.addressOwner ?? owner.address ?? owner.owner;
  return addr ? normalizeAddr(addr) : undefined;
}
