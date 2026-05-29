// Copyright (c) Alilloig
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module arb_executor::arb_executor_tests;

use arb_executor::arb_executor;
use deepbook::balance_manager_tests::USDC;
use deepbook::constants;
use deepbook::pool::{Self, Pool};
use deepbook::pool_tests::setup_everything;
use sui::coin::{Self, Coin, mint_for_testing};
use sui::sui::SUI;
use sui::test_scenario::{begin, end, return_shared};
use std::unit_test::assert_eq;
use token::deep::DEEP;

const OWNER: address = @0x1;
const TRADER: address = @0xCAFE;

// `setup_everything<SUI, USDC, SUI, DEEP>` seeds a SUI/USDC pool with liquidity.
// We borrow a small slice of the pool's SUI (base) reserve as the flash loan.
fun borrow_amount(): u64 {
    constants::float_scaling() // 1 base unit (1e9 for SUI)
}

// T-001: happy path. Borrow `borrow_amount` SUI via the pool's flash-loan hot
// potato, mint an exact-principal top-up, and let `execute_base` merge, repay
// the principal, and discharge the potato. The scenario completing without
// abort proves the FlashLoan was consumed. The sender should then own a
// remainder Coin<SUI> (the borrowed coin + topup minus the repaid principal).
#[test]
fun execute_base_repays_and_discharges_potato() {
    let mut test = begin(OWNER);
    let pool_id = setup_everything<SUI, USDC, SUI, DEEP>(&mut test);

    test.next_tx(TRADER);
    {
        let mut pool = test.take_shared_by_id<Pool<SUI, USDC>>(pool_id);

        let amount = borrow_amount();
        // Borrow the base asset: returns the borrowed coin + the hot potato.
        let (borrowed, loan) = pool::borrow_flashloan_base<SUI, USDC>(
            &mut pool,
            amount,
            test.ctx(),
        );
        // Top up with exactly the principal so the merged coin can repay in full
        // and leave a remainder equal to the borrowed slice.
        let topup = mint_for_testing<SUI>(amount, test.ctx());

        arb_executor::execute_base<SUI, USDC>(
            &mut pool,
            borrowed,
            loan,
            topup,
            amount,
            test.ctx(),
        );

        return_shared(pool);
    };

    // The wrapper transfers the leftover Coin<SUI> back to the sender.
    test.next_tx(TRADER);
    {
        let remainder = test.take_from_sender<Coin<SUI>>();
        assert_eq!(remainder.value(), borrow_amount());
        test.return_to_sender(remainder);
    };

    end(test);
}

// T-002: short repayment must abort. We borrow the principal but supply a
// zero-value top-up, then ask `execute_base` to repay MORE than the merged coin
// holds (2x the principal). The merged coin only covers `amount`, so the
// `assert!(value >= borrow_amount, ERepayShort)` guard fires before any split.
#[test, expected_failure(abort_code = ::arb_executor::arb_executor::ERepayShort)]
fun execute_base_aborts_on_short_repay() {
    let mut test = begin(OWNER);
    let pool_id = setup_everything<SUI, USDC, SUI, DEEP>(&mut test);

    test.next_tx(TRADER);
    {
        let mut pool = test.take_shared_by_id<Pool<SUI, USDC>>(pool_id);

        let amount = borrow_amount();
        let (borrowed, loan) = pool::borrow_flashloan_base<SUI, USDC>(
            &mut pool,
            amount,
            test.ctx(),
        );
        // No top-up: a zero-value coin. Merged coin holds only `amount`.
        let topup = coin::zero<SUI>(test.ctx());

        // Demand repayment of 2x the principal — unattainable, so ERepayShort.
        arb_executor::execute_base<SUI, USDC>(
            &mut pool,
            borrowed,
            loan,
            topup,
            amount * 2,
            test.ctx(),
        );

        return_shared(pool);
    };

    end(test);
}
