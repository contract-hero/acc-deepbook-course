# Section 3 — Consume it: `execute_base`

Now you write the function that actually discharges the hot potato. It does three things in order: merge the loan into your working coin, repay the *exact* principal, and settle whatever's left. Get the repayment amount wrong in either direction and the transaction reverts.

## What you'll write

The body of `execute_base` in `contracts/sources/arb_executor.move`:

```move
#[allow(lint(self_transfer))]
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

In a real arbitrage the borrowed funds would be traded across venues and `topup` would be the *profit* that lets you repay and pocket the spread. Here `topup` simply guarantees exact-principal repayment so the mechanics are clear.

## The key moment

**Repay *exactly* the principal — not less, not more.**

Two guards bracket the repayment, and they fail in opposite directions:

- **Too little → `ERepayShort` (yours).** `assert!(topup.value() >= borrow_amount, ERepayShort)` fires before the split. Without this named guard, `topup.split(borrow_amount, ctx)` would still abort — but with an opaque arithmetic underflow. The named code tells the caller exactly what went wrong.
- **Too much → `EIncorrectQuantityReturned` (the vault's).** `return_flashloan_base` asserts the returned coin's value **equals** `flash_loan.borrow_quantity` exactly. These flash loans carry *no interest*, so over-repaying is just as illegal as under-repaying — the vault rejects it and the PTB reverts.

That is why the repayment must be **exact**, not merely sufficient: `split` peels off precisely `borrow_amount`, hands that to `return_flashloan_base` (consuming the potato 🥔→💀), and the remainder — your "profit" — is `public_transfer`'d back to you. The `self_transfer` lint normally steers code toward returning objects for PTB composition, but this wrapper is a *terminal* action that settles in one move call, so routing the leftover straight to the sender is the intended shape (hence `#[allow(lint(self_transfer))]`).

## Verification

`sui move test -e localnet` (offline, no chain) exercises all three paths: happy repay-and-discharge, short-repay → `ERepayShort`, and over-repay → vault `EIncorrectQuantityReturned` (code 6). End-to-end, the live TS suite drives this exact function across a real PTB.
