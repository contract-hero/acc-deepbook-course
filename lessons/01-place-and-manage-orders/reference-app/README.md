# 02-orders — Pattern B: BalanceManager + Order Lifecycle

Reference snippet for the ACC lesson **`01-place-and-manage-orders`**.

## What this covers

**Pattern B** demonstrates the full DeepBook order-management workflow:

1. **BalanceManager creation** (`createAndShareBalanceManager`) — a shared on-chain
   escrow account that holds your trading balances. Required for all order operations.
2. **Deposit** (`depositIntoManager`) — funds are transferred into the BM before
   placing orders; the protocol locks the exact amount needed for each bid or ask.
3. **Limit order** (`placeLimitOrder`) — rests on the book at a specified price/quantity
   until matched or cancelled. Use `OrderType.NO_RESTRICTION` for standard behaviour,
   `POST_ONLY` to guarantee no immediate fill.
4. **Market order** (`placeMarketOrder`) — fills immediately against resting orders at
   the best available price. Requires liquidity on the opposing side (the sandbox
   market maker seeds this).
5. **Query open orders** (`accountOpenOrders`) — returns the list of resting order IDs
   for a BalanceManager on a given pool.
6. **Cancel all** (`cancelAllOrders`) — removes every open order in one transaction.
   Locked funds are returned to the BM and can be withdrawn.

### Settled vs. owed — the key reconciliation moment

When an order fills (partially or fully), DeepBook moves the settled amount to the
BalanceManager's settled balance. Until you call `withdrawFromManager`, that balance
stays in the BM. This separation lets you inspect what you received before withdrawing.

## Files

| File | Purpose |
|---|---|
| `src/sandbox.ts` | Shared connection helper (copied from 01-swap; adds `setupWithBalanceManagerBrowser`) |
| `src/orders.ts` | Core logic: `placeRestingBid`, `listOpenOrders`, `cancelAll`, `placeMarketBuy` |
| `src/App.tsx` | Minimal browser smoke driver (4 buttons) |
| `tests/orders.live.test.ts` | Live vitest tests against the running sandbox |

## Running the tests

Prerequisites:
- Local DeepBook sandbox running (`pnpm dev` or `pnpm deploy-all` in `deepbook-sandbox/`)
- Wait ~10 s for the market maker to seed liquidity on DEEP_SUI

```bash
export DEEPBOOK_SANDBOX_DEPLOYMENTS=/path/to/deepbook-sandbox/sandbox/deployments/localnet.json
cd lessons/_snippets/02-orders
pnpm install
pnpm test
```

> The `DEEPBOOK_SANDBOX_DEPLOYMENTS` override is required when the sandbox lives in
> a non-default path (e.g. a git worktree).

Expected output: **2 passed** — limit order lifecycle + market buy.

## Running the dev UI

```bash
export DEEPBOOK_SANDBOX_DEPLOYMENTS=...
pnpm dev   # opens http://localhost:5182
```

Click **Setup BalanceManager** first, then use the order buttons in sequence.
