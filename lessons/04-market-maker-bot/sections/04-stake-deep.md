# Section 4 — Stake DEEP for fee rebates

A maker earns the spread. A *staked* maker earns the spread **plus** fee rebates. DeepBook's governance lets you stake DEEP into a pool to qualify your account for maker fee rebates — and the rebates accrue inside the very same `BalanceManager` you've been quoting from.

## What you'll write

`stakeDeep(ctx, a)` in `src/marketMaker.ts` — deposit DEEP and stake it in one PTB:

```ts
export async function stakeDeep(ctx: SandboxConfigWithBM, a: StakeArgs): Promise<string> {
  const { client, keypair, balanceManagerKey } = ctx;

  const tx = new Transaction();
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'DEEP', a.depositDeep)(tx);
  client.deepbook.governance.stake(a.poolKey, balanceManagerKey, a.amount)(tx);
  return (await signAndExecute(client, keypair, tx)).digest;
}
```

## The key moment

**`governance.stake(poolKey, balanceManagerKey, amount)` upgrades a plain maker into a rebate-earning one.**

Staking is a governance action, not a trading one — that's why it lives under `client.deepbook.governance`, not `deepBook`. The deposit and the stake go in one PTB so the BM is funded before the stake draws from it. Staked DEEP qualifies the account for maker fee rebates that pool back into the same BM, so a busy maker on a fee-charging pool earns its placement fees back.

**Stake lands in two buckets across an epoch.** A fresh stake goes into `inactive_stake` *this* epoch and rolls into `active_stake` (effective) *next* epoch. So a correctness check has to be epoch-agnostic — sum both:

```ts
const info = await ctx.client.deepbook.account('DEEP_SUI', ctx.balanceManagerKey);
expect(info.active_stake + info.inactive_stake).toBeGreaterThan(0);
```

Assert only `active_stake` and the test flakes depending on which epoch boundary you happen to land on — the freshly-staked amount is sitting in `inactive_stake`.

## Verification

`pnpm vitest run` — the second live test stakes DEEP, asserts the digest looks valid, and reads `account(...)` to confirm `active_stake + inactive_stake > 0`. That proves the stake actually landed on-chain, not just that the call returned.
