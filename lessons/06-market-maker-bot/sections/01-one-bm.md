# Section 1 — One BalanceManager for both sides

A swap (Pattern A) passed coins straight through the pool. A market maker doesn't — it holds *inventory*. To quote a bid you need quote coin (SUI) on hand; to quote an ask you need base coin (DEEP) on hand. Both sides draw from **one** on-chain account: the `BalanceManager`.

## What you'll write

You'll lean on the canonical `src/sandbox.ts` (copied from the orders snippet). The piece that matters here is `setupWithBalanceManager()`:

- `setupSandbox()` first — fresh `Ed25519Keypair`, faucet-funded with SUI, DEEP, and USDC.
- `createAndShareBalanceManager()` in a transaction — creates the shared BM on-chain.
- Extract the new BM's object id from the executed transaction's effects.
- Re-build the client with that BM registered under a key, and return `{ client, keypair, address, manifest, balanceManagerId, balanceManagerKey }`.

## The key moment

**One shared `BalanceManager` is the inventory wallet behind every leg of the grid.**

```ts
const tx = new Transaction();
baseClient.deepbook.balanceManager.createAndShareBalanceManager()(tx);

const result = await baseClient.core.signAndExecuteTransaction({
  transaction: tx, signer: keypair,
  include: { effects: true, objectTypes: true },
});

const objectTypes = result.Transaction?.objectTypes ?? {};
const balanceManagerId = result.Transaction?.effects?.changedObjects?.find(
  (obj) => obj.idOperation === "Created"
    && objectTypes[obj.objectId]?.includes("BalanceManager"),
)?.objectId;

// Re-build the client with the BM registered under a key:
const client = createClient(address, manifest, {
  [BALANCE_MANAGER_KEY]: { address: balanceManagerId },
});
```

Two things make this the spine of the lesson:

1. **One BM, both sides.** You never split coins per order. You deposit DEEP *and* SUI into this single account, and every bid and every ask settles against it. It is the maker's book of record — fills, leftover inventory, and (after Section 4) staking rebates all live here.
2. **Extract the id from effects, not by guessing.** `createAndShareBalanceManager` *shares* the object, so you can't read it back off your own address. You find it in `effects.changedObjects` — the freshly-`Created` object whose `objectType` includes `BalanceManager` — then re-register it on the client under `MANAGER_1`.

## Verification

This section has no isolated test — `setupWithBalanceManager()` runs in the live suite's `beforeAll`. If the BM extraction is wrong, every later test fails at setup with "Failed to extract BalanceManager ID".
