# 01-swap — Swap over the CLOB (Pattern A)

A runnable mini-app that swaps **0.1 SUI → DEEP** on the `DEEP_SUI` pool of a
local **deepbook-sandbox**, directly from wallet coins — no `BalanceManager`
required.

Target ACC lesson: **`03-amm-swap-over-clob`**.

## Pattern A — `swapExactQuoteForBase` (no BalanceManager)

This is the simplest DeepBook trading interaction. Wallet coins go straight into
the pool and back out:

```ts
const tx = new Transaction();
const [baseCoin, quoteCoin, deepCoin] = tx.add(
  client.deepbook.deepBook.swapExactQuoteForBase({
    poolKey: 'DEEP_SUI', // base=DEEP, quote=SUI
    amount: 0.1,         // quote (SUI) to spend, human units
    deepAmount: 0,       // 0 — DEEP_SUI is whitelisted (no DEEP fee)
    minOut: 0,           // slippage guard (min base out); 0 = none (demo only)
  }),
);
// The builder returns three leftover coins. They MUST be returned to the
// sender or they are destroyed at the end of the transaction.
tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);
```

Key points:

- **`[base, quote, deep]` return.** The swap builder is a thunk that returns the
  three leftover coin handles. Always `transferObjects` them back to the sender.
- **`minOut` is the slippage guard.** If the pool cannot deliver at least
  `minOut` base coin, the transaction **reverts on-chain**. Setting `minOut: 0`
  disables protection (fine for a demo, never in production).
- **`deepAmount: 0`** because both sandbox pools are whitelisted, so no DEEP fee
  is charged.
- **No `BalanceManager`.** Unlike limit/market orders, swaps operate directly on
  wallet coins. (BalanceManager-based order flow is Pattern B — see `02-orders`.)

`swapQuoteForBase` reads the real DEEP received from the executed transaction's
`balanceChanges` (the positive delta of the pool's base coin type credited to
the sender, scaled from chain u64 to human units), so `baseOut` is a genuine
on-chain figure — not a placeholder.

## Files

| File | Purpose |
|---|---|
| `src/sandbox.ts` | **Canonical** connection helper — manifest loading, client construction, faucet funding, `signAndExecute`. Copied by sibling snippets. |
| `src/swap.ts` | Pure swap core: `swapQuoteForBase(ctx, args)`. |
| `src/App.tsx` + `src/main.tsx` | Minimal in-browser smoke driver. |
| `tests/swap.live.test.ts` | Live test against the running sandbox. |

## Run

> The test and dev server require a **running deepbook-sandbox** (gRPC at
> `127.0.0.1:9000`, faucet at `127.0.0.1:9009`, manifest at
> `~/workspace/deepbook-sandbox/sandbox/deployments/localnet.json`).
> Start it with `pnpm deploy-all` in the deepbook-sandbox repo first.

```bash
pnpm install
pnpm test     # runs tests/swap.live.test.ts against the live sandbox
pnpm dev      # serves the smoke UI on http://localhost:5181
pnpm build    # typecheck + production build
```

The manifest path can be overridden with the `DEEPBOOK_SANDBOX_DEPLOYMENTS`
environment variable.
