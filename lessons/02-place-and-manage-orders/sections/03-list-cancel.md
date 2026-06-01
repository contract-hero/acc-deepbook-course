# Section 3 — Inspect the book, then clear it

Your bid is resting. Prove it: query the BalanceManager's open orders, get the order ID back, then cancel every order in one transaction. This is the half of order management that *isn't* placing — and it's what turns a fire-and-forget call into a real, queryable position you control.

## What you'll write

Two small functions in `src/orders.ts`:

```ts
export async function listOpenOrders(ctx, poolKey: 'DEEP_SUI'): Promise<string[]> {
  return ctx.client.deepbook.accountOpenOrders(poolKey, ctx.balanceManagerKey);
}

export async function cancelAll(ctx, poolKey: 'DEEP_SUI'): Promise<string> {
  const tx = new Transaction();
  ctx.client.deepbook.deepBook.cancelAllOrders(poolKey, ctx.balanceManagerKey)(tx);
  return (await signAndExecute(ctx.client, ctx.keypair, tx)).digest;
}
```

## The key moment

**`accountOpenOrders` reads *your* orders by BM key; `cancelAllOrders` clears them and releases the locked funds.**

```ts
const open = await listOpenOrders(ctx, 'DEEP_SUI'); // → [orderId, …]
await cancelAll(ctx, 'DEEP_SUI');                    // book emptied for this BM
```

The two calls form a round-trip that proves the model:

- **`accountOpenOrders(poolKey, balanceManagerKey)`** returns the live order-ID list for *this* BalanceManager on *this* pool. An empty array means nothing is resting. Because the bid is keyed to your BM, only your orders come back — not the whole book.
- **`cancelAllOrders(poolKey, balanceManagerKey)(tx)`** is again a thunk; it appends one command that cancels every open order in a single PTB. The quote DeepBook had *locked* for the bid is released back into the BM's balance — it doesn't vanish and it doesn't return to your wallet; it goes back to the account, ready to redeploy or withdraw.

That "locked → released back into the BM" flow is the same accounting that makes fills land in a *settled* balance (Section 4). Orders are objects with state, and the BM is where that state is reconciled.

## Verification

`pnpm vitest run` — the first live test runs the full round-trip: place, `expect(open.length).toBeGreaterThan(0)`, cancel, then `expect((await listOpenOrders(...)).length).toBe(0)`. Both ends must hold — a nonempty book that won't empty, or an empty book that should have had the bid, each fails it.
