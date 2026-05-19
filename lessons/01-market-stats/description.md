# DeepBook Market Stats — Chain-Direct

**What you'll build.** A React dashboard that shows live market stats — mid price, bid/ask spread, depth within ±1%, 24h volume, last price, and a sparkline — for every pool deployed on the local DeepBook sandbox. No indexer, no SDK shortcuts; you talk to Sui JSON-RPC directly and decode the order book yourself.

**Why "chain-direct" matters.** Most DeepBook tutorials lean on the indexer at `:9008` or the high-level SDK. This lesson teaches the layer below: how a pool's state actually lives on chain (a `Versioned<PoolInner>` wrapper around a `Book` with `BigVector<Order>` for asks and bids), how to decode an `order_id` to get its price, how `OrderInfo` events are paginated, and how to assemble the pieces into a usable dashboard. By the end you'll understand exactly what the indexer is doing for you when you do reach for it.

**Prerequisites.**
- Working knowledge of React hooks and TypeScript.
- Comfortable reading JSON-RPC request/response shapes.
- *Helpful but not required:* prior exposure to Sui object ownership and shared objects.

**Environment.** This lesson reads from the live DeepBook sandbox. ACC sets all of it up on first run — you don't need to clone or deploy anything by hand.

What ACC does automatically:
- Picks a workspace location: the first time you run any ACC lesson it asks where you want your project repos, defaulting to `~/workspace`. The choice is stored in `~/.acc/config.json` as `workspace_root`.
- Clones [`deepbook-sandbox`](https://github.com/MystenLabs/deepbook-sandbox) to `<workspace_root>/deepbook-sandbox` if it's not already there, and runs `pnpm install` in the sandbox subdir.
- Brings up the stack via `pnpm deploy-all --quick` (Docker must be running) so both endpoints answer:
  - **`localhost:9000`** — Sui JSON-RPC (every per-pool fetch the lesson writes will hit this).
  - **`localhost:9009/manifest`** — the sandbox faucet's deployment manifest (the Vite middleware serves it to the browser).

The conductor runs all of the above as preflight probes. If `localhost:9009/manifest` is unreachable later, it offers to re-run `pnpm deploy-all --quick`.

If you already have the sandbox checked out somewhere non-default (or want to relocate it later), edit `~/.acc/config.json`:

```json
{
  "workspace_root": "~/workspace",
  "course_paths": {
    "acc-deepbook-course@contract-hero": {
      "sandbox": "~/wherever/deepbook-sandbox"
    }
  }
}
```

Use `@local` instead of `@contract-hero` if you installed the course from a local marketplace; the exact key lives in `~/.claude/plugins/installed_plugins.json`.

**The deliverable.** When you reach the final section, `pnpm vitest run` in your workspace passes the same 24-test suite the reference implementation passes. The test suite is the equivalence gate — your code doesn't have to look like the reference, it just has to behave like it.

**Estimated time.** 90–120 minutes if you write each load-bearing piece yourself in `learning` mode. 30–45 minutes if you pick `explanatory` mode and read along.
