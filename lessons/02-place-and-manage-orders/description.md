# DeepBook Place & Manage Orders

> The full order lifecycle: open an account, fund it, rest an order, watch it on the book, cancel it — then take liquidity with a market buy.

**What you'll build.** A headless order manager on the sandbox's `DEEP_SUI` pool. You'll create and share a `BalanceManager` (DeepBook's on-chain escrow account), deposit `SUI` into it, place a limit bid far below mid so it *rests* on the book, list it back by order ID, cancel every open order, and finally place a market buy that fills immediately against the market maker's asks — all from one funded keypair.

**The big idea.** Pattern A (the swap lesson) passed wallet coins straight through the pool. Pattern B opens an *account*. A `BalanceManager` is a shared object that escrows your balances: you deposit before trading, the protocol locks the exact amount each order needs, and fills settle back into the BM as a *settled* balance that stays there until you withdraw. That settled-vs-owed separation is the heart of order management — it's why you can place, inspect, and cancel without your coins ever leaving the BM.

**Architecture at a glance.**

```
setupWithBalanceManager()                placeRestingBid(ctx, args)
  manifest → DeepBook client    ─▶         deposit SUI → BM
  fresh keypair + faucet                   placeLimitOrder (bid @ 50% mid)  ─▶  rests on book
  createAndShareBalanceManager             ┌───────────────────────────────┐
  re-create client WITH the BM             │ listOpenOrders → [orderId, …]  │
                                           │ cancelAll      → book emptied  │
                                           └───────────────────────────────┘
                                         placeMarketBuy(ctx, args)
                                           deposit SUI + placeMarketOrder  ─▶  fills now, settles to BM
```

**Prerequisites.**
- Comfortable with TypeScript and `async/await`.
- The swap lesson (Pattern A) helps but isn't required — this lesson re-introduces the sandbox client.
- A running deepbook-sandbox with a seeded market maker (the lesson's prerequisite probes bring it up for you).

**Estimated time.** ~50 min.

---

This file is rendered before personalization. The HTML artifact carries the depth as you move through the five sections.
