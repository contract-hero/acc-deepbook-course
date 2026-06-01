# 03-flash-loan — Atomic flash loan via the hot-potato (Pattern E)

A runnable mini-app that borrows **1 DEEP** from the `DEEP_SUI` pool of a local
**deepbook-sandbox**, runs an "arb step" inside a custom Move module, and repays
the **exact principal** — all in a single programmable transaction block (PTB).

This snippet has **two halves**: a Move package (`contracts/`) that consumes the
flash loan on-chain, and a TypeScript driver that assembles the borrow-and-settle
PTB.

Target ACC lesson: **`05-flash-loan-arbitrage`**.

## Pattern E — the FlashLoan hot potato

DeepBook's `pool::borrow_flashloan_base` hands the borrower two things:

1. the borrowed `Coin<Base>`, and
2. a `deepbook::vault::FlashLoan` value.

`FlashLoan` has **no abilities** — no `drop`, no `store`, no `key`. It is a *hot
potato*: the Move type system makes it impossible to drop, store, or transfer.
The only way to discharge it is to pass it back into
`pool::return_flashloan_base` (which destructures and consumes it). If the PTB
ends with the potato un-consumed, the **entire transaction aborts**.

That is the structural guarantee that makes the loan **risk-free for the pool's
liquidity providers**: either the principal comes back in full within the same
atomic transaction, or nothing happened at all. No collateral, no trust — the
compiler enforces it.

The vault additionally asserts the returned coin's value **equals the borrowed
principal exactly** (`EIncorrectQuantityReturned`). These flash loans carry no
interest, so over-repaying aborts too — you must return the principal precisely.

### The Move module's role (`contracts/sources/arb_executor.move`)

```move
public fun execute_base<Base, Quote>(
    pool: &mut Pool<Base, Quote>,
    borrowed: Coin<Base>,   // the flash-loaned coin
    loan: FlashLoan,        // the hot potato
    mut topup: Coin<Base>,  // stand-in for arb profit
    borrow_amount: u64,     // the exact principal to repay
    ctx: &mut TxContext,
) {
    topup.join(borrowed);                              // merge profit + loan
    assert!(topup.value() >= borrow_amount, ERepayShort);
    let repay = topup.split(borrow_amount, ctx);       // exact principal
    pool::return_flashloan_base(pool, repay, loan);    // consumes the potato
    transfer::public_transfer(topup, ctx.sender());    // remainder back to caller
}
```

In a real arbitrage the borrowed funds would be traded across venues and the
`topup` would be the *profit* that lets you repay the principal and keep the
spread. Here the top-up simply guarantees exact-principal repayment so the
mechanics are clear. The `ERepayShort` guard gives a named error if the merged
coin can't cover the principal (without it, the `split` would abort with an
opaque arithmetic error).

### The PTB (`src/flashLoan.ts`)

```ts
const tx = new Transaction();
// borrow → [coin, flashLoan]; both must be consumed this tx
const [coin, flashLoan] = tx.add(client.deepbook.flashLoans.borrowBaseAsset('DEEP_SUI', 1));
const topup = coinWithBalance({ type: deepType, balance: BigInt(topupScaled) });
tx.moveCall({
  target: `${arbExecutorPackageId}::arb_executor::execute_base`,
  typeArguments: [deepType, '0x2::sui::SUI'],
  arguments: [tx.object(poolId), coin, flashLoan, topup, tx.pure.u64(borrowScaled)],
});
```

The borrow thunk and the `execute_base` call live in **one PTB**, so the borrow
and the repay are atomic. Pass `overrideBorrowAmount: 2` with `borrow: 1` and `topup: 0` to demand
repayment of 2 DEEP when only 1 DEEP was borrowed. The merged coin is 1 DEEP — less
than the demanded 2 — so `execute_base`'s `assert!(topup.value() >= borrow_amount)`
fires (`ERepayShort`) → the whole PTB reverts and the loan never settled.

> Note: passing `topup: 0` alone is NOT sufficient to force a revert. The borrowed
> coin itself equals the principal, so `topup.join(borrowed)` already covers
> `borrow_amount` and repayment succeeds. `overrideBorrowAmount` is needed to demand
> more than was borrowed.

> **Scaling.** DEEP uses a `1e6` on-chain scalar. The SDK's `borrowBaseAsset`
> takes a *human* amount and scales it internally, but the on-chain
> `borrow_quantity` that must be repaid exactly is the *scaled* `u64`. So the
> `borrow_amount` handed to `execute_base` is the same human amount scaled by
> `1e6` here in the driver.

## Files

| File | Purpose |
|---|---|
| `contracts/sources/arb_executor.move` | The Move module that consumes the flash loan. |
| `contracts/tests/arb_executor_tests.move` | Move unit tests (happy path + short-repay abort) against a seeded `setup_everything` pool. |
| `contracts/scripts/deploy.sh` | Stages + publishes `arb_executor` against the live localnet; writes `deployment.json`. |
| `src/sandbox.ts` | Canonical connection helper (copied verbatim from `01-swap`). |
| `src/flashLoan.ts` | The borrow-and-settle PTB: `runFlashLoanArb(ctx, args)`. |
| `src/App.tsx` + `src/main.tsx` | Minimal in-browser smoke driver. |
| `tests/flashLoan.live.test.ts` | Live test against the running sandbox. |
| `deployment.json` | Published `arbExecutorPackageId`. **Chain-specific** — see below. |

## Run

> Requires a **running deepbook-sandbox** (gRPC at `127.0.0.1:9000`, faucet at
> `127.0.0.1:9009`, manifest at the path below). Start it with `pnpm deploy-all`
> in the deepbook-sandbox repo first.

### 1. Publish the Move package

The TS test reads `deployment.json` for the package id, so the Move package must
be published against the live localnet **before** running `pnpm test`:

```bash
# DEEPBOOK_SANDBOX_DIR defaults to $HOME/workspace/deepbook-sandbox/sandbox.
# Point it at whichever sandbox tree published the live localnet:
DEEPBOOK_SANDBOX_DIR=$HOME/workspace/deepbook-sandbox/sandbox \
  bash contracts/scripts/deploy.sh
```

This stages the module inside the sandbox tree (so `.external-packages/{token,
deepbook}` resolve), runs `sui client test-publish -e localnet`, and writes
`deployment.json = { "arbExecutorPackageId": "0x…" }`.

> **`deployment.json` is chain-specific.** The package id is only valid on the
> localnet instance it was published to. If you re-genesis or redeploy the
> sandbox, **re-run `deploy.sh`** to regenerate it, or the live test will fail
> against a stale id.

### 2. Run the Move tests (optional, no chain needed)

```bash
cd contracts
sui move test -e localnet   # 2 tests: repay+discharge, and short-repay abort
```

> The package targets the `localnet` build environment because the `deepbook`
> dependency declares one. **Do not add an `[addresses]` block** to
> `contracts/Move.toml` — a named-address module binds its address via the
> environment, and an explicit block makes the build reject `localnet` with a
> misleading "Environment `localnet` is not present" error.

### 3. Run the TS driver

```bash
pnpm install
pnpm test     # tests/flashLoan.live.test.ts against the live sandbox
pnpm dev      # serves the smoke UI on http://localhost:5183
pnpm build    # typecheck + production build
```

The manifest path is overridable with `DEEPBOOK_SANDBOX_DEPLOYMENTS`:

```bash
export DEEPBOOK_SANDBOX_DEPLOYMENTS=$HOME/workspace/deepbook-sandbox/sandbox/deployments/localnet.json
```

### Live-test determinism: pre-seeding the pool vault

The sandbox's shared DEEP_SUI pool is serviced by a market maker that continuously
deposits and withdraws base liquidity. When the market maker drains the vault,
`borrow_flashloan_base` aborts with `ENotEnoughBaseForLoan`
(`assert!(self.base_balance.value() >= borrow_quantity)`), making the happy-path
test intermittently fail.

The live test works around this by calling `seedPoolBaseLiquidity` (exported from
`src/flashLoan.ts`) immediately before each borrow. That helper deposits 5 DEEP
into the pool vault via a BalanceManager, raising `base_balance` well above the
0.5 DEEP borrow amount used in both tests. The borrow then always succeeds, and the
negative test reverts for the right reason (`ERepayShort` inside `execute_base`)
rather than at the borrow step.

This is purely a sandbox-determinism measure. **Real (mainnet/testnet) flash-loan
integrations do not need this step** — production DEEP_SUI pools already hold
substantial base liquidity, so the pool vault is never the bottleneck for a small
flash loan.
