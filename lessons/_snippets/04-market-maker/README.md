# 04-market-maker — Pattern F: Two-Sided Grid Quoting + DEEP Staking

Demonstrates how to act as a market maker on DeepBook v3 using a single
BalanceManager for inventory across both sides of a pool, POST_ONLY limit
orders arranged in a grid around mid price, and DEEP staking to earn maker
fee rebates.

## Concepts covered

- **Two-sided grid**: place `N` bid levels and `N` ask levels symmetrically
  around the current mid price, each level offset by `spreadBps / 10_000 * i`
  from mid. POST_ONLY semantics ensure every order rests on the book (the VM
  rejects any leg that would immediately cross).
- **Unified BalanceManager inventory**: a single on-chain BalanceManager holds
  both the base (DEEP) and quote (SUI) balances needed for all grid legs. No
  per-order coin splitting in the caller.
- **DEEP staking for rebates**: staking DEEP tokens in a pool via
  `governance.stake` qualifies the account for maker fee rebates. Rebates
  accumulate inside the BM and are claimable on settlement.
- **Inventory-skew key moment**: if the market moves against one side, the BM
  accumulates inventory (filled bids increase DEEP, filled asks increase SUI).
  A production bot must re-balance and re-quote periodically — this snippet
  shows the atomic `cancelAllOrders → quoteTwoSidedGrid` cycle.

## Target ACC lesson

`06-market-maker-bot`

## File layout

```
src/
  sandbox.ts       — canonical DeepBook sandbox client (copied from 02-orders)
  marketMaker.ts   — quoteTwoSidedGrid, stakeDeep, listOpenOrders, cancelAll
  App.tsx          — browser UI: Start quoting / Stake DEEP / Cancel all
  main.tsx         — React entry point
tests/
  marketMaker.live.test.ts  — live sandbox integration tests
```

## Running

### Prerequisites

1. deepbook-sandbox running locally (`pnpm deploy-all` from the sandbox repo).
2. Set the manifest override so the SDK finds localnet addresses:

```sh
export DEEPBOOK_SANDBOX_DEPLOYMENTS=/path/to/deepbook-sandbox/sandbox/deployments/localnet.json
```

### Tests

```sh
pnpm install
pnpm test
```

Both tests (`places a two-sided grid then cancels it`, `stakes DEEP for fee
rebates`) run live against the sandbox and should pass deterministically.

### Dev UI

```sh
pnpm dev   # opens http://localhost:5184
```

Click **Setup BalanceManager** first, then **Start quoting** (places the grid)
or **Stake DEEP**, and finally **Cancel all** to unwind.

## Parameter choices

| Parameter | Value | Reason |
|---|---|---|
| `levels` | 2 | 2 bids + 2 asks = 4 resting orders total |
| `spreadBps` | 500 (5%) | Keeps all levels clear of the seeded market-maker quotes on the sandbox; POST_ONLY would reject at tighter spreads |
| `sizePerLevel` | 10 DEEP | DEEP_SUI pool minimum order size is 10 DEEP (lot size 1 DEEP) |
| `depositSui` | 20 SUI | Covers 2 bid levels × 10 DEEP at ~0.03 SUI/DEEP ≈ 6 SUI total, with margin |
| `depositDeep` | 200 DEEP | Covers 2 ask levels × 10 DEEP = 20 DEEP for orders + 50 DEEP staking deposit |
