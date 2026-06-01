# DeepBook Swap over the CLOB

> The simplest possible DeepBook trade: wallet coins in, wallet coins out — no account object, no order book bookkeeping.

**What you'll build.** A headless swap that spends `0.1 SUI` and receives `DEEP` on the sandbox's `DEEP_SUI` pool, using DeepBook's `swapExactQuoteForBase`. You'll connect to a local deepbook-sandbox, send the swap straight from wallet coins, hand back the leftover coins the builder returns, arm a slippage guard, and read the *real* amount filled out of the executed transaction's balance changes.

**The big idea.** DeepBook is infrastructure, not a product. You are not rebuilding a matching engine — you're calling one. This pattern (Pattern A) is the lightest way to touch it: no `BalanceManager`, no shared account, just coins passing through the pool in a single transaction.

**Architecture at a glance.**

```
setupSandbox()                      swapQuoteForBase(ctx, args)
  manifest → DeepBook client   ─▶     tx: swapExactQuoteForBase  ─▶  signAndExecute
  fresh keypair + faucet              [base, quote, deep] coins       (effects + balanceChanges)
                                      tx.transferObjects(...)    ◀─    baseOut = Δ(base coin)
```

**Prerequisites.**
- Comfortable with TypeScript and `async/await`.
- A running deepbook-sandbox (the lesson's prerequisite probes bring it up for you).

**Estimated time.** ~40 min.

---

This file is rendered before personalization. The HTML artifact carries the depth as you move through the five sections.
