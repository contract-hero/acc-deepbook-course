# Section 5 — Assemble the borrow-and-settle PTB

The Move module is published; now build the transaction that calls it. The borrow and the repay must happen in **one** programmable transaction block — that single-PTB constraint is what makes the loan atomic.

## What you'll write

`src/flashLoan.ts` — `runFlashLoanArb(ctx, args)`:

```ts
const DEEP_SCALAR = 1_000_000; // DEEP has 6 decimals on-chain

const deepType = manifest.pools.DEEP_SUI.baseCoinType;
const poolId = manifest.pools.DEEP_SUI.poolId;
const borrowScaled = Math.round(a.borrow * DEEP_SCALAR);
const topupScaled  = Math.round((a.topup ?? a.borrow) * DEEP_SCALAR);
const repayScaled  = a.overrideBorrowAmount !== undefined
  ? Math.round(a.overrideBorrowAmount * DEEP_SCALAR)
  : borrowScaled;

const tx = new Transaction();

// borrow thunk → [coin, flashLoan] NestedResults; both consumed THIS tx
const [coin, flashLoan] = tx.add(
  client.deepbook.flashLoans.borrowBaseAsset(a.poolKey, a.borrow),
);

const topup = coinWithBalance({ type: deepType, balance: BigInt(topupScaled) });

tx.moveCall({
  target: `${a.arbExecutorPackageId}::arb_executor::execute_base`,
  typeArguments: [deepType, '0x2::sui::SUI'],
  arguments: [tx.object(poolId), coin, flashLoan, topup, tx.pure.u64(repayScaled)],
});

const res = await signAndExecute(client, keypair, tx);
return res.digest;
```

## The key moment

**Borrow and repay in the SAME `Transaction` — that's the atomicity.**

`borrowBaseAsset` is a *thunk*: `tx.add(...)` returns `[coin, flashLoan]` as PTB `NestedResult`s — the borrowed coin and the hot-potato handle. They are not values you hold in JavaScript; they are references that flow straight into the next command's `arguments`. Because the `tx.moveCall` to `execute_base` lives in the *same* `tx`, the borrow and the repay are one indivisible unit: there is no moment between them where the chain has lent you money and not been repaid. Split them across two transactions and the first would simply abort — the potato can never survive a transaction boundary.

**Scaling, the easy-to-miss detail.** `borrowBaseAsset` takes a *human* amount (`0.5`) and scales it internally. But the `borrow_amount` u64 your Move module must repay *exactly* is the *scaled* on-chain quantity. So the driver scales the same way — `Math.round(a.borrow * DEEP_SCALAR)` — and hands the scaled value as the last `moveCall` argument. Pass a human `0.5` where the module expects `500000` and the vault's exact-equality check rejects the repayment.

## Verification

`pnpm vitest run` — the first live test drives this exact path: borrow `0.5` DEEP, run `execute_base`, repay, and asserts the returned `digest` matches `/^[A-Za-z0-9]+$/` (a committed transaction).
