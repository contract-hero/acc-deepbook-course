# Section 4 — Take liquidity, and reconcile settled vs. owed

Resting a bid *makes* a market. A market order *takes* one. Now fire a market buy that fills immediately against the maker's resting asks — and understand where the coins you bought actually land. They don't hit your wallet; they settle into the BalanceManager.

## What you'll write

`placeMarketBuy(ctx, args)` in `src/orders.ts` — deposit and order in **one** PTB:

```ts
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
```

## The key moment

**One PTB: deposit + `placeMarketOrder`, `payWithDeep: false` — and the fill settles into the BM, not your wallet.**

Three things to internalise:

1. **Deposit and order share a transaction.** Both thunks are appended to the same `tx`, so the freshly-deposited `SUI` is available to the market order in the same on-chain context — one signature, one round-trip, no window where the BM is funded but idle.
2. **`payWithDeep: false`.** DEEP_SUI is whitelisted, so DeepBook charges its fee out of the *traded* coins rather than a separate DEEP balance. On a non-whitelisted pool you'd need DEEP in the BM and `payWithDeep: true`.
3. **Settled vs. owed — the reconciliation.** A market buy fills against the maker's asks and the bought `DEEP` is credited to the BM's **settled** balance. That's distinct from being *owed* to you in your wallet: the value is yours, recorded in the account, but it stays in the BM until you explicitly `withdrawFromManager`. This separation is the whole point of trading through a BalanceManager — you can place, fill, inspect, and net multiple orders against one escrowed balance before ever moving coins back out.

## Verification

`pnpm vitest run` — the second live test calls `placeMarketBuy` and asserts the digest matches `/^[A-Za-z0-9]+$/`. Because a freshly-seeded sandbox can momentarily lack asks, the test tolerates *liquidity-shaped* failures (Section 5 covers exactly how narrowly).
