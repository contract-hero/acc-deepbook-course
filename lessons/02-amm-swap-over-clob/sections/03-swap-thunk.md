# Section 3 — The swap, and the coins you must hand back

This is the heart of the lesson. `swapExactQuoteForBase` spends quote coin (`SUI`) and gives you base coin (`DEEP`), straight from wallet coins — no `BalanceManager`. But the builder hands you back three loose coins, and what you do with them is the make-or-break detail.

## What you'll write

`src/swap.ts` — `swapQuoteForBase(ctx, args)` up to the `signAndExecute` call:

```ts
const tx = new Transaction();
const [baseCoin, quoteCoin, deepCoin] = tx.add(
  client.deepbook.deepBook.swapExactQuoteForBase({
    poolKey: args.poolKey, // 'DEEP_SUI' → base=DEEP, quote=SUI
    amount: args.amount,   // quote (SUI) to spend, human units
    deepAmount: 0,         // whitelisted pool → no DEEP fee
    minOut: args.minOut,   // slippage guard (min base out)
  }),
);
tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);

const result = await signAndExecute(client, keypair, tx);
```

## The key moment

**`tx.add(...)` returns `[base, quote, deep]` — you MUST `transferObjects` them back.**

The swap builder is a *thunk*: when you `tx.add` it, it returns three coin handles — the base coin you bought, the quote coin left over, and a DEEP coin (fees/refund). They exist only inside the transaction. If you don't move them to an owner before the transaction ends, Move has nowhere to put them and **the whole transaction aborts** (you can't silently drop a coin with value). One line fixes it:

```ts
tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);
```

Forgetting this is the single most common first-swap bug. The leftover coins aren't optional cleanup — they're values you own and must claim.

Two supporting choices in the same call:

- **`deepAmount: 0`** — both sandbox pools are *whitelisted*, so DeepBook charges no DEEP fee. On a non-whitelisted pool you'd budget DEEP here.
- **`minOut`** — the slippage guard. You pass it now; Section 5 proves what it does on-chain.

## Verification

`pnpm vitest run` — the first live test (`swaps SUI for DEEP ...`) drives exactly this path end-to-end. If you dropped the `transferObjects`, the swap reverts and the test fails immediately.
