# Section 1 — Connect & fund

A flash loan still needs the same starting point as any DeepBook trade: a client that knows where the pool lives, a funded signer, and — this time — a `BalanceManager`. Your job is to wire up the connection and make sure the pool will actually have DEEP to lend you when you ask.

## What you'll write

`src/sandbox.ts` is the canonical connection helper (identical to the swap lesson). You'll lean on:

- `loadManifest()` — read `deployments/localnet.json` (path from `DEEPBOOK_SANDBOX_DEPLOYMENTS`, else the default sandbox checkout) into a typed `DeploymentManifest`. A missing file is the "is the sandbox up?" signal.
- `createClient(...)` — `new SuiGrpcClient(...).$extend(deepbook({ packageIds, coins, pools }))`, all derived from the manifest.
- `setupWithBalanceManager()` — fresh `Ed25519Keypair`, faucet-funded for SUI/DEEP/USDC, *plus* an on-chain `BalanceManager` created and shared. Returns `{ client, keypair, address, manifest, balanceManagerId, balanceManagerKey }`.

## The key moment

**`setupWithBalanceManager()` + `seedPoolBaseLiquidity(ctx, 5)` — the loan needs liquidity to draw.**

The flash-loan helper itself only touches `ctx.client / keypair / manifest`; it never uses the BalanceManager. So why create one? Because the pool's lendable base must be topped up *through* a BM:

```ts
ctx = await setupWithBalanceManager();
await seedPoolBaseLiquidity(ctx, 5); // deposit 5 DEEP into the pool vault
```

The shared sandbox `DEEP_SUI` vault is serviced by a market maker that continuously deposits and withdraws base liquidity. When it drains the vault, `borrow_flashloan_base` aborts with `ENotEnoughBaseForLoan` (`assert!(self.base_balance.value() >= borrow_quantity)`) — and your happy-path test fails intermittently for a reason that has nothing to do with your code. `seedPoolBaseLiquidity` deposits 5 DEEP via the BM right before each borrow, raising `base_balance` well above the 0.5 DEEP you'll borrow.

This is purely a **sandbox-determinism crutch.** Real (mainnet/testnet) `DEEP_SUI` pools already hold deep standing liquidity, so the vault is never the bottleneck for a small flash loan — production integrations skip this step entirely.

## Verification

No isolated test — `setupWithBalanceManager()` and `seedPoolBaseLiquidity()` are the `beforeAll` spine of the live suite. If the manifest is missing or the faucet is down, the suite fails fast there with an actionable error.
