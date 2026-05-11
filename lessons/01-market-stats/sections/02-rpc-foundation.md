# Section 2 — RPC foundation

With the manifest in hand, ask the chain for a pool's current state.

The RPC method is **`sui_getObject`** with the pool's ID and `options: { showContent: true }`. The response wraps the pool inside a `Versioned<PoolInner>` shell. You have to navigate down into the right field path to find the actual `Book` with its `asks` and `bids` BigVectors.

## What you'll write

A first chunk of `src/dataLayer.ts` covering:

- `rpc<T>(rpcUrl, method, params)` — a tiny `fetch`-based JSON-RPC client that POSTs `{ jsonrpc: "2.0", id, method, params }` and returns the `result` field (or throws on `error`).
- `fetchPoolInner(rpcUrl, poolId)` — calls `sui_getObject`, descends to `content.fields.value.fields`, returns a `PoolInnerState`.

## The key moment

**The descent path: `content.fields.value.fields`.**

`Pool<Base, Quote>` is a Sui Move struct, but it's wrapped in `Versioned<PoolInner>` for upgrade safety. The Sui RPC reflects that as:

```
data
└── content                          ← { dataType: "moveObject", ... }
    └── fields
        ├── id                       ← outer Pool's UID
        └── value                    ← the Versioned wrapper
            └── fields               ← PoolInner finally
                ├── pool_id
                └── book
                    └── fields       ← Book struct
                        ├── asks     ← BigVector<Order>
                        ├── bids     ← BigVector<Order>
                        ├── lot_size
                        ├── min_size
                        └── tick_size
```

Get the path wrong and every `Book.fields.asks` lookup downstream returns `undefined`. There's no compile-time check protecting you — only the runtime assertions in the tests. The fix is to capture the shape once in `notes/chain-shape.md` (already shipped in the reference) and treat it as the single source of truth; don't rebuild the path from training memory.

## RPC etiquette

- The Sui localnet RPC is at `http://127.0.0.1:9000` (or `VITE_SUI_RPC_URL` if set).
- One call per pool per refresh is fine for the sandbox; production would batch.
- No indexer: T-014 (`tests/networkShape.test.ts`) lints your code to ensure no `:9008` URLs slip in and no method other than `sui_getObject`, `suix_queryEvents`, or `suix_getDynamicFields` is called.

## Verification

`pnpm vitest run tests/networkShape.test.ts` (RPC-method whitelist) — this one matters because the cycle contract forbids indexer use. If it fails, your data layer is calling a forbidden endpoint.
