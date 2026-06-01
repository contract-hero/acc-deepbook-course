# Section 1 — Connect & fund

A flash loan still needs the same starting point as any DeepBook trade: a client that knows where the pool lives, a funded signer, and — this time — a `BalanceManager`. Your job is to wire up the connection and make sure the pool will actually have DEEP to lend you when you ask.

## What you'll write

`src/sandbox.ts` is the canonical connection helper (identical to the swap lesson). You'll lean on:

- `loadManifest()` — read `deployments/localnet.json` (path from `DEEPBOOK_SANDBOX_DEPLOYMENTS`, else the default sandbox checkout) into a typed `DeploymentManifest`. A missing file is the "is the sandbox up?" signal.
- `createClient(...)` — `new SuiGrpcClient(...).$extend(deepbook({ packageIds, coins, pools }))`, all derived from the manifest.
- `setupWithBalanceManager()` — fresh `Ed25519Keypair`, faucet-funded for SUI/DEEP/USDC, *plus* an on-chain `BalanceManager` created and shared. Returns `{ client, keypair, address, manifest, balanceManagerId, balanceManagerKey }`.

## The key moment

**`seedPoolBaseLiquidity(ctx, 50)` — and *how* you actually fund the pool's lendable base.**

`borrow_flashloan_base` lends from the pool **vault's** `base_balance` — the physical base coin escrowed *inside the pool* (`assert!(self.base_balance.value() >= borrow_quantity)`). On a freshly-deployed sandbox the `DEEP_SUI` vault's base fluctuates with the market maker and can dip below your borrow, so the borrow aborts with `ENotEnoughBaseForLoan` for a reason that has nothing to do with your code.

The trap: a `BalanceManager` deposit does **not** fix this. `depositIntoManager` credits *your account*, not the pool vault — they're separate custody. The only way base reaches `vault.base_balance` is to **escrow it via an order**: when you place an *ask* (sell base), the pool's `settle_balance_manager` pulls that base out of your BM and `join`s it into the vault. So that's what the seed does — deposit DEEP, then rest a DEEP ask far above mid (`POST_ONLY`, so it's guaranteed to rest and never fill):

```ts
ctx = await setupWithBalanceManager();
await seedPoolBaseLiquidity(ctx, 50); // escrow 50 DEEP into vault.base_balance via a resting ask
```

That locks 50 DEEP into the vault for the life of the suite — comfortably above both the pool's minimum order size and the 0.5 DEEP you'll borrow — so the borrow succeeds deterministically.

This is purely a **sandbox-determinism crutch.** Real (mainnet/testnet) `DEEP_SUI` pools already hold deep standing liquidity, so the vault is never the bottleneck for a small flash loan — production integrations skip this entirely.

## Verification

No isolated test — `setupWithBalanceManager()` and `seedPoolBaseLiquidity()` are the `beforeAll` spine of the live suite. If the manifest is missing or the faucet is down, the suite fails fast there with an actionable error.
