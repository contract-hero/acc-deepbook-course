// Copyright (c) Alilloig
// SPDX-License-Identifier: Apache-2.0

/// Pattern E — atomic flash loan via Sui's hot-potato.
///
/// DeepBook's `pool::borrow_flashloan_base` hands back the borrowed `Coin<Base>`
/// plus a `deepbook::vault::FlashLoan` value. `FlashLoan` has NO abilities
/// (no `drop`, no `store`, no `key`) — it is a hot potato. The only way to
/// discharge it is to pass it back into `pool::return_flashloan_base` within the
/// SAME transaction. If the PTB ends with the potato un-consumed, the whole
/// transaction aborts. That is the structural guarantee that makes a flash loan
/// risk-free for the pool's liquidity providers: either the principal comes back
/// in full, or nothing happened.
///
/// The vault asserts the returned coin's value EQUALS the borrowed principal
/// EXACTLY (`EIncorrectQuantityReturned`) — flash loans here carry no interest,
/// so over-repaying also aborts. This module merges a caller-supplied top-up
/// into the borrowed coin, splits off exactly the principal to repay, and
/// transfers any remainder back to the caller.
module arb_executor::arb_executor;

use deepbook::pool::{Self, Pool};
use deepbook::vault::FlashLoan;
use sui::coin::Coin;

// === Errors ===

/// The borrowed coin plus the top-up cannot cover the principal that must be
/// repaid. Without this guard the `topup.split(borrow_amount, ctx)` below would
/// abort with an opaque arithmetic error; this gives the caller a named code.
const ERepayShort: u64 = 1;

// === Public functions ===

/// Consume a base-asset flash loan in one shot.
///
/// 1. Merge the caller's `topup` coin into the `borrowed` coin (in a real arb
///    the top-up would be the profit from whatever trade was executed against
///    the borrowed funds; here it simply guarantees exact-principal repayment).
/// 2. Assert the merged coin can cover the principal.
/// 3. Split off EXACTLY `borrow_amount` and repay via `return_flashloan_base`,
///    which consumes the `FlashLoan` hot potato.
/// 4. Transfer the remainder back to the sender.
///
/// `borrow_amount` MUST equal the principal that was borrowed: the vault asserts
/// `repay.value() == flash_loan.borrow_quantity`, so any other value aborts.
///
/// The final `public_transfer` to the sender trips the `self_transfer` lint —
/// that lint steers code toward returning objects for PTB composition, but this
/// wrapper is a terminal action (it consumes the hot potato and settles the
/// remainder in one move call), so routing the leftover straight to the caller
/// is the intended shape here.
#[allow(lint(self_transfer))]
public fun execute_base<Base, Quote>(
    pool: &mut Pool<Base, Quote>,
    borrowed: Coin<Base>,
    loan: FlashLoan,
    mut topup: Coin<Base>,
    borrow_amount: u64,
    ctx: &mut TxContext,
) {
    topup.join(borrowed);
    assert!(topup.value() >= borrow_amount, ERepayShort);

    let repay = topup.split(borrow_amount, ctx);
    pool::return_flashloan_base(pool, repay, loan);

    transfer::public_transfer(topup, ctx.sender());
}
