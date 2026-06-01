# Section 4 — Read the real fill

You sent the swap. How much `DEEP` did you actually get? Don't guess from the order book — read it from what the chain *did*. The executed transaction carries `balanceChanges`; the answer is the positive delta of the base coin credited to your address.

## What you'll write

The rest of `src/swap.ts` — the `baseDelta` helper and the `baseOut` computation:

```ts
const baseCoinType = manifest.pools[args.poolKey].baseCoinType;
const scalar = BASE_SCALAR[args.poolKey];        // DEEP 1e6, SUI 1e9
const baseOut = baseDelta(result, baseCoinType, address) / scalar;
return { digest: result.digest, baseOut };
```

```ts
function baseDelta(result, coinType, owner): number {
  const changes = result?.balanceChanges ?? result?.effects?.balanceChanges ?? [];
  const wantType = normalizeStructTag(coinType);
  const wantOwner = normalizeSuiAddress(owner);
  let total = 0;
  for (const ch of changes) {
    const chType = normalizeStructTag(ch.coinType ?? ch.coin_type ?? "");
    const chAddr = ch.address ? normalizeSuiAddress(ch.address) : extractOwner(ch.owner);
    const amount = Number(ch.amount ?? 0);
    if (chType === wantType && (!chAddr || chAddr === wantOwner) && amount > 0) total += amount;
  }
  return total;
}
```

## The key moment

**Compare coin types through `normalizeStructTag`, and sum only positive deltas to *your* address.**

Three things make this robust, and all three are easy to get wrong:

1. **Normalize the type.** The manifest stores a coin type that may differ in `0x`-padding from what the chain echoes back. `normalizeStructTag` canonicalizes both sides so the comparison actually matches. Compare raw strings and you'll silently sum nothing → `baseOut === 0`.
2. **Positive delta only.** You *spent* `SUI` (negative) and *received* `DEEP` (positive). Filtering `amount > 0` for the base coin type isolates what you gained.
3. **Owner shape varies by transport.** gRPC puts the address on `ch.address`; JSON-RPC wraps it in `ch.owner`. `extractOwner` handles both so the same code works regardless of client.

Then divide by the coin scalar to get human units. `baseOut` is now a genuine on-chain figure — the actual amount filled — not an estimate.

## Verification

`pnpm vitest run` — the first live test asserts `res.baseOut > 0`. A `0` here almost always means a type-normalization miss or an empty ask book (the test retries the latter).
