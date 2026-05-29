# DeepBook Integration Snippets

Runnable, **sandbox-tested** reference apps for the most common DeepBook V3 integration
patterns. Each snippet is a small, self-contained mini-app (headless core + a minimal Vite
UI + a live test suite) that runs end-to-end against the local
[deepbook-sandbox](https://github.com/MystenLabs/deepbook-sandbox).

These are **staging material**, not lessons. Each one is the reference codebase a future
ACC lesson graduates from (via the `lesson-creator` skill). The framing throughout:
**DeepBook is infrastructure, not a product** — every snippet is a team choosing *not* to
rebuild the matching engine, and spending its effort on the product on top.

Background: `docs/deepbook-integration-research.md` (pattern taxonomy) and
`docs/superpowers/specs/2026-05-29-deepbook-integration-snippets-design.md` (design).

## The Core 4

| Pattern | Snippet | Target lesson | Key SDK / Move calls | Teaching moment |
|---|---|---|---|---|
| **A** — swap over a CLOB | [`01-swap`](./01-swap) | `03-amm-swap-over-clob` | `deepBook.swapExactQuoteForBase` (no BalanceManager) | the `minOut` slippage guard; the `[base, quote, deep]` return tuple |
| **B** — orders on Spot | [`02-orders`](./02-orders) | `02-place-and-manage-orders` | `balanceManager.createAndShareBalanceManager` / `depositIntoManager`, `deepBook.placeLimitOrder` / `placeMarketOrder` / `cancelAllOrders` | the BalanceManager lifecycle; settled-vs-owed reconciliation |
| **E** — flash loan | [`03-flash-loan`](./03-flash-loan) | `05-flash-loan-arbitrage` | `flashLoans.borrowBaseAsset` + a Move module calling `pool::return_flashloan_base` | the `FlashLoan` hot-potato — repay in the same PTB or the whole tx reverts (LPs bear no risk) |
| **F** — market making | [`04-market-maker`](./04-market-maker) | `06-market-maker-bot` | `deepBook.placeLimitOrder` grid (POST_ONLY), `governance.stake` | two-sided quoting; one BalanceManager spans all pools; stake DEEP for rebates |

`01-swap`, `02-orders`, `04-market-maker` are TypeScript-only. `03-flash-loan` additionally
ships a Move package (`contracts/`) whose module consumes the hot-potato on-chain.

## Architecture (all snippets)

```
<snippet>/
├── src/sandbox.ts    load deployment manifest → SuiGrpcClient.$extend(deepbook(...)) + faucet
├── src/<core>.ts     the teachable surface — the SDK calls the lesson dissects (pure: takes client+signer)
├── src/App.tsx       minimal Vite UI that drives <core> (smoke driver)
├── tests/*.live.test.ts   end-to-end against the running sandbox
└── README.md         pattern summary, key calls, target lesson, run steps
```

The connection helper `src/sandbox.ts` is copied into each snippet (self-contained, so each
graduates cleanly into a standalone lesson reference-app). It is adapted from the sandbox's
own `examples/sandbox/setup.ts`. `02-orders` and `04-market-maker` carry a
`setupWithBalanceManagerBrowser` variant (for their BalanceManager-backed UIs) that
`01-swap`/`03-flash-loan` don't need — that's the only intentional difference between the copies.

## Running against the sandbox

**1. Bring up the sandbox** (Docker required):
```bash
cd ~/workspace/deepbook-sandbox/sandbox
pnpm deploy-all --quick      # wait for "DeepBook Sandbox Ready!"
```
This deploys DeepBook to a local Sui network, seeds `DEEP_SUI` + `SUI_USDC` pools with a
market maker, and writes `deployments/localnet.json`.

**2. Point the snippets at the deployment manifest.** By default `sandbox.ts` reads
`~/workspace/deepbook-sandbox/sandbox/deployments/localnet.json`. If your sandbox was
deployed from a different checkout (e.g. a git worktree), override the path:
```bash
export DEEPBOOK_SANDBOX_DEPLOYMENTS=/path/to/deepbook-sandbox/sandbox/deployments/localnet.json
```

**3. Run a snippet** (live tests + UI):
```bash
cd lessons/_snippets/01-swap
pnpm install
pnpm test       # live — runs end-to-end against the sandbox (Docker must be up)
pnpm dev        # minimal UI on its own port (5181–5184)
```

The live tests fund a fresh ephemeral keypair from the sandbox faucet per case, so they're
isolated and never depend on prior on-chain state.

### `03-flash-loan` has an extra step

Its Move package must be published to the sandbox before `pnpm test`:
```bash
# DEEPBOOK_SANDBOX_DIR defaults to ~/workspace/deepbook-sandbox/sandbox
DEEPBOOK_SANDBOX_DIR=/path/to/deepbook-sandbox/sandbox \
  bash lessons/_snippets/03-flash-loan/contracts/scripts/deploy.sh
```
This publishes `arb_executor` and writes `deployment.json` with its package id. That id is
**chain-specific** — re-run `deploy.sh` after any sandbox redeploy. The Move package's
`Move.toml` dependency paths also point at the sandbox `.external-packages/` — edit them to
match your checkout.

## How these become lessons

Each snippet is the `reference-app` seed for an ACC lesson. To turn one into a lesson, invoke
ACC's `lesson-creator` skill, pointing it at this course and the snippet directory; it drafts
the ordered sections, the equivalence test suite, and the evolving HTML artifact. The target
lesson slug for each snippet is in the table above.
