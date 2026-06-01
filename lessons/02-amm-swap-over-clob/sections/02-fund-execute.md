# Section 2 — Fund & execute

A client can read the chain, but a swap *writes* to it — so you need a funded signer and a way to send transactions that gives you back enough information to see what happened.

## What you'll write

The second half of `src/sandbox.ts`:

- `fundFromFaucet(address, token)` / `fundWallet(address)` — POST to the sandbox faucet for `SUI`, `DEEP`, and `USDC`.
- `setupSandbox()` — generate a fresh `Ed25519Keypair`, fund it, construct the client, return `{ client, keypair, address, manifest }`.
- `signAndExecute(client, keypair, tx)` — sign, send, wait, return the executed transaction.

## The key moment

**`include: { effects: true, balanceChanges: true }`, then `waitForTransaction`.**

```ts
export async function signAndExecute(client, keypair, tx) {
  const result = await client.core.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    include: { effects: true, balanceChanges: true }, // ← load-bearing
  });
  if (result.$kind === "FailedTransaction") {
    throw new Error(`Transaction failed: ${JSON.stringify(result.FailedTransaction)}`);
  }
  await client.core.waitForTransaction({ digest: result.Transaction!.digest });
  return result.Transaction!;
}
```

`balanceChanges` is the whole reason Section 4 can report a *real* fill instead of a guess. If you don't ask for it here, it isn't in the response and `baseDelta` has nothing to sum. `waitForTransaction` matters when one tx depends on another being indexed first (it doesn't bite a single swap, but it's the correct habit).

**Why a fresh keypair every run?** `setupSandbox()` mints a brand-new address and faucet-funds it. That makes each test run hermetic — it never depends on coins or orders left behind by a previous run. Reusing a long-lived key is the classic source of "passes once, then flakes."

## Verification

Still no isolated test — `setupSandbox()` and `signAndExecute()` are the spine every swap test runs through. A faucet or funding failure surfaces in the `beforeAll` of the live suite.
