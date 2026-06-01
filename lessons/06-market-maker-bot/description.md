# DeepBook Market-Maker Bot

> Stop taking liquidity — start *providing* it. Quote both sides of the book, rest your orders, and earn the spread instead of paying it.

**What you'll build.** A headless market-maker for the sandbox's `DEEP_SUI` pool. One `BalanceManager` holds the inventory for *both* sides; you compute a symmetric grid of bid/ask levels around the current mid price, rest every leg with `POST_ONLY` so it can never cross and take, stake `DEEP` through governance to qualify for maker fee rebates, and unwind the whole book with an atomic `cancelAllOrders` so you can re-quote on the next tick.

**The big idea.** This is Pattern F — market making. A taker (Pattern A's swap) crosses the spread and pays a fee; a *maker* posts resting orders and collects it. The two things that make a maker a maker: it quotes **two-sided** (a bid *and* an ask, so it earns the round-trip), and its orders are **`POST_ONLY`** (the matching engine rejects any leg that would immediately fill, so the bot is never accidentally a taker). One `BalanceManager` is the shared inventory wallet behind every leg.

**Architecture at a glance.**

```
setupWithBalanceManager()            quoteTwoSidedGrid(ctx, args)
  one BM holds DEEP + SUI    ─▶        mid = midPrice(pool)
  (inventory for both sides)           for i in 1..levels:
                                         bid = mid·(1 − spread·i)   POST_ONLY
        ask level 2  ───────┐           ask = mid·(1 + spread·i)   POST_ONLY
        ask level 1  ──────┐ │
        ──────── mid ──────┼─┼──── (no order crosses this line)
        bid level 1  ──────┘ │
        bid level 2  ────────┘
                                     stakeDeep(ctx, …) → governance.stake → rebates
                                     cancelAll(ctx, …) → re-quote next tick
```

**Prerequisites.**
- Comfortable with TypeScript and `async/await`.
- You've seen a DeepBook swap (Pattern A) and basic order placement — this lesson assumes a `BalanceManager` is a familiar idea.
- A running deepbook-sandbox (the lesson's prerequisite probes bring it up for you).

**Estimated time.** ~50 min.

---

This file is rendered before personalization. The HTML artifact carries the depth as you move through the sections.
