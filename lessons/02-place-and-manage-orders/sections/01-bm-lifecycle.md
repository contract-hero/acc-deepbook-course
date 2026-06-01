# Section 1 — Open the account: the BalanceManager lifecycle

Pattern A swapped wallet coins straight through the pool. Order management needs something more: an *account* the protocol can lock funds in while your orders rest. That account is a `BalanceManager` — a shared on-chain object — and creating one correctly is a precise three-step dance.

## What you'll write

The BalanceManager-creation path in `src/sandbox.ts`:

- `setupWithBalanceManager()` — start from `setupSandbox()` (fresh keypair + faucet), then create the BM.
- `createBalanceManagerClient(...)` — the shared helper that builds the BM transaction, extracts its id, and re-creates the client.

The `setupSandbox()` half (manifest → client, fresh keypair, faucet funding, `signAndExecute`) is the same spine as the swap lesson; lean on it and focus your attention on the BM creation.

## The key moment

**Create → share → *re-extend the client* with the BM.**

```ts
const tx = new Transaction();
baseClient.deepbook.balanceManager.createAndShareBalanceManager()(tx); // ← thunk

const result = await baseClient.core.signAndExecuteTransaction({
  transaction: tx,
  signer: keypair,
  include: { effects: true, objectTypes: true }, // objectTypes lets us find the BM
});

const objectTypes = result.Transaction?.objectTypes ?? {};
const balanceManagerId = result.Transaction?.effects?.changedObjects?.find(
  (obj) =>
    obj.idOperation === "Created" &&
    objectTypes[obj.objectId]?.includes("BalanceManager"),
)?.objectId;

// ← the load-bearing step: a NEW client that knows the BM by key
const client = createClient(address, manifest, {
  [BALANCE_MANAGER_KEY]: { address: balanceManagerId },
});
```

Three traps, all easy to miss:

1. **It's a thunk.** `createAndShareBalanceManager()` returns a function; you call it *with the transaction* — `(...)(tx)` — to append the command. Forgetting the second call leaves an empty transaction.
2. **Digging out the id.** A create produces several objects. You want the one whose `idOperation === "Created"` *and* whose type contains `"BalanceManager"` — hence requesting `objectTypes: true`. Match on type alone and you may grab a coin or the gas object.
3. **Re-create the client.** The first (`baseClient`) has no BM registered. Every later call — `depositIntoManager`, `placeLimitOrder`, `accountOpenOrders` — takes a `balanceManagerKey` and looks it up in the client's `balanceManagers` map. You must build a fresh client carrying `{ MANAGER_1: { address: balanceManagerId } }` or those lookups throw "unknown manager."

## Verification

No isolated test — `setupWithBalanceManager()` is the `beforeAll` of the live suite. If the BM bootstrap is wrong, every order test fails before its first assertion with an "unknown manager" or "Failed to extract BalanceManager ID" error.
