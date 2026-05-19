# DeepBook Market Stats — Chain-Direct

**What you'll build.** A React dashboard that shows live market stats — mid price, bid/ask spread, depth within ±1%, 24h volume, last price, and a sparkline — for every pool deployed on the local DeepBook sandbox. No indexer, no SDK shortcuts; you talk to Sui JSON-RPC directly and decode the order book yourself.

**Why "chain-direct" matters.** Most DeepBook tutorials lean on the indexer at `:9008` or the high-level SDK. This lesson teaches the layer below: how a pool's state actually lives on chain (a `Versioned<PoolInner>` wrapper around a `Book` with `BigVector<Order>` for asks and bids), how to decode an `order_id` to get its price, how `OrderInfo` events are paginated, and how to assemble the pieces into a usable dashboard. By the end you'll understand exactly what the indexer is doing for you when you do reach for it.

**Prerequisites.**
- Working knowledge of React hooks and TypeScript.
- Comfortable reading JSON-RPC request/response shapes.
- *Helpful but not required:* prior exposure to Sui object ownership and shared objects.

**Environment.** This lesson reads from the live DeepBook sandbox. ACC sets it up as preflight remediations on first run — you don't need to clone or deploy anything by hand. On a fresh machine the framework prompts you once for a `workspace_root` (default `~/workspace`) and persists your choice to `~/.acc/config.json`.

Cold-path expectation: ~500 MB of Docker images + ~100 MB of git/install content, 5-10 min on broadband. Subsequent starts skip everything that's already there.

**Trust note.** Auto-bootstrap runs `git clone https://github.com/MystenLabs/deepbook-sandbox` and `pnpm install` inside the cloned repo. Review the upstream before approving the remediation if you don't trust it.

What ACC checks (and remediates if missing):
- **deepbook-sandbox checkout** — cloned to `<sandbox-path>` (default `${workspace_root}/deepbook-sandbox`) if not already there; `pnpm install` runs inside the sandbox subdir.
- **`localhost:9000`** — Sui JSON-RPC (every per-pool fetch the lesson writes will hit this).
- **`localhost:9009/manifest`** — the sandbox faucet's deployment manifest (the Vite middleware serves it to the browser). If unreachable, ACC offers to run `pnpm deploy-all --quick` from `<sandbox-path>/sandbox` (Docker must be running).

To relocate the sandbox to a non-default location (now or later), the plugin key in `course_paths` is whatever appears for this course in `~/.claude/plugins/installed_plugins.json` — `@contract-hero` if you installed from the marketplace, `@local` for dev work. Then edit `~/.acc/config.json`:

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

**The deliverable.** When you reach the final section, `pnpm vitest run` in your workspace passes the same 24-test suite the reference implementation passes. The test suite is the equivalence gate — your code doesn't have to look like the reference, it just has to behave like it.

**Estimated time.** 90–120 minutes if you write each load-bearing piece yourself in `learning` mode. 30–45 minutes if you pick `explanatory` mode and read along.
