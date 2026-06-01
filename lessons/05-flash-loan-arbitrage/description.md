# Flash-Loan Arbitrage with the Hot Potato

> Borrow money you don't have, use it, and pay it back — all before the transaction ends. No collateral, zero risk to the lender, enforced not by a contract clause but by the Move type system itself.

**What you'll build.** An atomic flash loan: borrow `0.5 DEEP` from the sandbox's `DEEP_SUI` pool with `flashLoans.borrowBaseAsset`, run an "arb step" inside your own `arb_executor` Move module, and repay the *exact* principal through `pool::return_flashloan_base` — every step inside a single programmable transaction block (PTB). This is Pattern E, and it spans both layers: a Move package that consumes the loan on-chain, and a TypeScript driver that assembles the PTB.

**The big idea — the hot potato.** `borrow_flashloan_base` hands you back two things: the borrowed `Coin<DEEP>` and a `deepbook::vault::FlashLoan` value. `FlashLoan` has **no abilities** — no `drop`, no `store`, no `key`. The Move compiler makes it impossible to discard, save, or transfer. The *only* way to get rid of it is to feed it back into `pool::return_flashloan_base` in the same transaction. Forget to, and the whole PTB aborts. That structural guarantee — repay-in-full-or-nothing-happened — is exactly what makes the loan risk-free for the pool's liquidity providers. No collateral, no trust: the type system is the collateral.

**Architecture at a glance.**

```
                       ┌──────────────── ONE PTB (atomic) ────────────────┐
setupWithBalanceManager()
  manifest → client     borrowBaseAsset('DEEP_SUI', 0.5)
  fresh keypair+faucet ─▶  → [ coin (DEEP) , flashLoan 🥔 no-drop ]
  BalanceManager            │                     │
                            ▼                     │  (must be consumed THIS tx)
                       arb_executor::execute_base │
                         topup.join(coin)         │
                         split exact principal ───┘
                         pool::return_flashloan_base(repay, loan) 🥔→💀
                         transfer remainder → sender
                       └───────────────────────────────────────────────────┘
                              short repay ⇒ ERepayShort ⇒ entire PTB reverts
```

**Prerequisites.**
- Comfortable with TypeScript, `async/await`, and basic Sui Move (modules, `Coin`, abilities).
- A running deepbook-sandbox (the lesson's prerequisite probes bring it up for you).
- **The Move package must be published to the sandbox first.** The `arb_executor` package id is read from `deployment.json`, so before the live test can run you publish the package against the live localnet with the snippet's deploy script: `DEEPBOOK_SANDBOX_DIR=$HOME/workspace/deepbook-sandbox/sandbox bash contracts/scripts/deploy.sh`. That id is chain-specific — re-run the script if you re-genesis the sandbox.

**Estimated time.** ~55 min.

---

This file is rendered before personalization. The HTML artifact carries the depth as you move through the six sections.
