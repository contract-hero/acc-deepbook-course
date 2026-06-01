# Section 2 — The hot potato

This is the conceptual heart of the lesson. Before you write a line of TypeScript, you need to understand *why* a flash loan with no collateral is safe — and the answer lives entirely in the Move type system.

## What you'll write

The top of `contracts/sources/arb_executor.move` — the module declaration and imports:

```move
module arb_executor::arb_executor;

use deepbook::pool::{Self, Pool};
use deepbook::vault::FlashLoan;
use sui::coin::Coin;

const ERepayShort: u64 = 1;
```

That's it for now — the structure that follows (Section 3) is what *consumes* the loan. First understand what you're consuming.

## The key moment

**`FlashLoan` has no abilities — the compiler is the collateral.**

When you call `pool::borrow_flashloan_base`, it hands back two values:

1. the borrowed `Coin<Base>`, and
2. a `deepbook::vault::FlashLoan`.

`FlashLoan` is declared with **no abilities at all** — no `drop`, no `store`, no `key`. In Move, a value without `drop` *cannot be silently discarded*; a value without `store` *cannot be saved in a struct or object*; a value without `key` *cannot become an object you transfer away*. So a `FlashLoan` can only be *passed by value into a function that consumes it*. There is exactly one such function:

```move
pool::return_flashloan_base(pool, repay, loan); // destructures + consumes the potato
```

This is the **hot potato** pattern. If your transaction ends and the `FlashLoan` is still alive — you forgot to repay, or your repay coin was the wrong size — the code *does not compile*, or at runtime the **entire PTB aborts**. There is no path where you keep the borrowed money and don't return it.

That single compile-time fact is the whole safety model: a flash loan needs no collateral and no trust because the lender's principal *must* come back in full within the same atomic transaction, or the transaction reverts as if it never happened. The pool's liquidity providers bear zero risk — not because of a clause they hope you honor, but because the type system makes default structurally impossible.

## Verification

No isolated TS test — this section is the foundation for `execute_base` (Section 3). The Move package also ships `contracts/tests/arb_executor_tests.move`, runnable offline with `sui move test -e localnet`: one test proves the potato is discharged on the happy path, two prove the tx aborts when repayment is wrong.
