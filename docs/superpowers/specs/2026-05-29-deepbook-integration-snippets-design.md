# DeepBook Integration Snippets — Design Spec

*Date: 2026-05-29 · Status: approved (design) · Author: brainstorming session*

## Purpose

Build a curated set of **runnable, sandbox-tested code snippets** that showcase the
most common DeepBook V3 integration patterns. Each snippet is a small, self-contained
mini-app that runs end-to-end against the **deepbook-sandbox** local environment. The
explicit downstream consumer is the **ACC `lesson-creator` skill**: each snippet is the
reference codebase a future lesson (02–08) graduates from.

This spec is grounded in `docs/deepbook-integration-research.md` (the pattern taxonomy
A–H and the recommended lesson roadmap) and in the existing precedent set by
`deepbook-sandbox-evaluation-apps/independent/` (whose `01-market-stats` is byte-identical
to this course's `lessons/01-market-stats`).

## Scope

**In scope — the "Core 4" highest-frequency production patterns:**

| # | Snippet | Pattern (research) | Target ACC lesson |
|---|---------|--------------------|-------------------|
| 01 | `01-swap` | A — liquidity routing / swap | 03 `amm-swap-over-clob` |
| 02 | `02-orders` | B — full trading on Spot | 02 `place-and-manage-orders` |
| 03 | `03-flash-loan` | E — flash-loan atomic composition | 05 `flash-loan-arbitrage` |
| 04 | `04-market-maker` | F — market making / LP | 06 `market-maker-bot` |

**Out of scope (deferred to a later batch):** Pattern C (hybrid AMM), Pattern D
(margin/derivatives, lesson 08), Pattern G (permissionless pool, lesson 07), Pattern H
(read-only analytics, already covered by lesson 01). Pattern D is feasible later because
the sandbox already deploys `deepbook_margin` + `USDC`/`SUI` margin pools.

## Locked decisions

- **Location:** `lessons/_snippets/` (underscore-prefixed staging dir beside real lessons).
- **Shape:** headless core (`src/<core>.ts`) + a minimal Vite UI that drives it, mirroring
  the eval `independent/` apps.
- **Tests:** **live-sandbox only** — every test runs end-to-end against the running
  sandbox; no mock-RPC layer. Docker must be up.
- **SDK:** `@mysten/deepbook-v3` ^1.3.0 + `@mysten/sui` ^2.x (pin exact versions against
  the installed SDK at implementation time — the SDK moves fast; see Caveats).
- **Move:** `03-flash-loan` ships a Move package + a TS driver; the other three are TS-only.
- **Organization (approach ①):** four **self-contained** mini-apps, each with its own
  `package.json`, lockfile, and a ~50-line copy of `sandbox.ts`. Standalone graduation into
  an ACC lesson reference-app is the priority; the small duplicated connection helper is
  acceptable (and desirable for copy-into-lesson).
- **Package manager:** pnpm, independent install per snippet (own `pnpm-lock.yaml`), like
  the eval `independent/` apps.

## Architecture

### Folder layout

```
lessons/_snippets/
├── README.md                 # index: pattern → snippet → lesson + run-against-sandbox guide
├── 01-swap/                  # Pattern A
├── 02-orders/                # Pattern B
├── 03-flash-loan/            # Pattern E  (Move + TS)
└── 04-market-maker/          # Pattern F
```

Directory numbers follow **conceptual learning order**: swap (simplest — `swapExactQuantity`
needs no BalanceManager) → orders (introduces the BalanceManager lifecycle) → flash-loan
(PTB hot-potato + Move) → market-maker (builds on orders + DEEP staking). The *implementation*
build order (see "Build sequence") differs — flash-loan is built last because it's the
heaviest (adds a Move package).

### Uniform per-snippet anatomy

```
<snippet>/
├── package.json        @mysten/deepbook-v3 ^1.3.0, @mysten/sui ^2.x, vite, vitest, react
├── tsconfig.json
├── vite.config.ts      serves deployments/localnet.json at /localnet.json + vitest config
├── index.html
├── src/
│   ├── sandbox.ts      load deployment manifest → SuiClient + DeepBookClient + faucet helper
│   ├── <core>.ts       THE teachable surface — the SDK calls the lesson will dissect
│   ├── App.tsx         minimal UI that drives <core>
│   └── main.tsx
├── tests/<core>.live.test.ts   end-to-end against the running sandbox
└── README.md           pattern, key SDK calls, target lesson, run steps
```

`03-flash-loan` additionally ships:

```
03-flash-loan/
├── contracts/
│   ├── Move.toml
│   ├── sources/arb_executor.move   # receives borrowed Coin, performs the arb step, returns it
│   ├── tests/arb_executor_tests.move
│   └── scripts/deploy.sh
└── ...                              # standard TS anatomy above; driver builds the PTB
```

### Sandbox connection (`sandbox.ts` — shared shape across all four)

Reads the sandbox deployment manifest, resolved in this order:

1. `process.env.DEEPBOOK_SANDBOX_DEPLOYMENTS` (explicit path override), else
2. `~/workspace/deepbook-sandbox/sandbox/deployments/localnet.json` (default), else
3. `http://localhost:9009/manifest` (HTTP fallback).

The manifest provides: `network.{rpcUrl,faucetUrl}`, `packages.{deepbook,token,usdc,
deepbook_margin,...}`, `pools.{DEEP_SUI,SUI_USDC}`, `pythOracles.{deepPriceInfoObjectId,
suiPriceInfoObjectId}`, `deployerAddress`, `supplierCapId`.

`sandbox.ts` exports:
- `loadDeployment(): Deployment` — parse + validate the manifest (non-empty IDs).
- `makeClients(deployment): { suiClient, dbClient }` — `SuiClient({ url: rpcUrl })` and a
  configured `DeepBookClient` (env = `localnet`, package overrides from the manifest, pools
  registered by key).
- `fundTestAddress(address): Promise<void>` — POST `:9009/faucet` for SUI + DEEP + USDC.
- `assertSandboxUp(): Promise<void>` — used by `beforeAll`; throws an actionable
  "bring up the sandbox (`cd deepbook-sandbox/sandbox && pnpm deploy-all --quick`)" error
  when the manifest/RPC is unreachable.

### The four teachable surfaces

- **01-swap** — `swapExactBaseForQuote` / `swapExactQuoteForBase` (BalanceManager path)
  plus `swapExactQuantity` (no-BM aggregator path). **Key moment:** the `minOut` slippage
  guard, the `[baseOut, quoteOut, deepOut]` return tuple, and DEEP-vs-input fee handling.
- **02-orders** — `createAndShareBalanceManager` → `depositIntoManager` →
  `placeLimitOrder` + `placeMarketOrder` → read open orders / fills → `cancelOrder`.
  **Key moment:** the settled-vs-owed balance reconciliation after each action
  (`Vault::settle_balance_manager`).
- **03-flash-loan** — `borrowBaseAsset` → on-chain arb step (`arb_executor::execute`) →
  `returnBaseAsset`, all in one PTB. **Key moment:** the `FlashLoan` hot-potato — the tx
  reverts if the loan isn't repaid in the same PTB, so LPs bear no risk.
- **04-market-maker** — a two-sided `placeLimitOrder` grid, `cancelOrders`, inventory
  managed across a single BalanceManager, `stake`/`unstake` DEEP for rebates. **Key
  moment:** inventory skew and why one BalanceManager spans all pools.

### Minimal UI

Each `App.tsx` is a thin driver: a button (or few) that invokes `<core>` against the
sandbox and renders the result (resulting balances / order ids / arb P&L / live quotes).
The UI is intentionally minimal — the teachable substance lives in `<core>.ts`. `vite.config.ts`
serves `localnet.json` via dev-server middleware (the eval-app pattern) so the browser path
can read the same manifest the tests use.

## Data flow

```
deployments/localnet.json ──► sandbox.ts (loadDeployment + makeClients)
                                   │
   fresh keypair ◄── fundTestAddress (:9009/faucet)
                                   │
                                   ▼
                            <core>.ts  ──build PTB──►  SuiClient.signAndExecute ──► sandbox chain
                                   ▲                                                      │
                                   └──────────── read effects / events ◄─────────────────┘
```

## Error handling (taught, not hidden)

- **Slippage:** `01-swap` passes `minOut`; an order that would breach it reverts — a
  negative test asserts this.
- **Flash-loan safety:** `03-flash-loan` includes a negative test where under-repayment
  causes the whole PTB to revert (hot-potato unconsumed / balance short).
- **Order management:** `cancelOrder` on a non-existent order surfaces a clear error.
- **Sandbox down:** `assertSandboxUp()` throws an actionable error pointing at the
  deploy command, rather than a cryptic connection failure.

## Test strategy (live-sandbox only)

Each `tests/<core>.live.test.ts`:
1. `beforeAll(assertSandboxUp)` — fail fast with a helpful message if Docker is down.
2. Generate a fresh `Ed25519Keypair`; `fundTestAddress` it.
3. Execute the pattern against the live sandbox.
4. Assert on-chain effects:
   - **swap:** balance deltas honor `minOut`; output tuple shape is correct.
   - **orders:** placed order appears in open orders; `cancelOrder` clears it; a crossing
     order produces a fill that settles into the BalanceManager.
   - **flash-loan:** the arb PTB succeeds and repays; the negative under-repay test reverts.
   - **market-maker:** the grid quotes appear in `getLevel2Range`; cancel-all clears them;
     `stake` raises the account's staked amount.

The flash-loan Move package additionally carries Move unit tests (`arb_executor_tests.move`)
run via `sui move test` — the only non-vitest test surface in the set.

## README index (`lessons/_snippets/README.md`)

- A pattern → snippet → target-lesson → key-SDK-calls → key-teaching-moment table.
- A "Running against the sandbox" section: bring up sandbox → `pnpm i` →
  `pnpm test` (live) → `pnpm dev` (UI). Notes the `DEEPBOOK_SANDBOX_DEPLOYMENTS` override.
- A "How these become lessons" note pointing at the `lesson-creator` skill.

## Build sequence (for the implementation plan)

1. `lessons/_snippets/README.md` skeleton + the shared `sandbox.ts` reference
   implementation (authored once, copied into each snippet).
2. `01-swap` (no BalanceManager path first, then BM path) + live test.
3. `02-orders` (BalanceManager lifecycle) + live test.
4. `04-market-maker` (depends conceptually on orders) + live test.
5. `03-flash-loan` Move package (`arb_executor.move` + Move tests + deploy script), then
   the TS driver PTB + live test (incl. negative under-repay test).
6. Fill in the README index table once all four exist; final live-suite pass with the
   sandbox up.

## Caveats / verify at implementation time

- **Pin SDK signatures** against the installed `@mysten/deepbook-v3` ^1.3.0 — exact method
  names and argument shapes (`placeLimitOrder`, `swapExact*`, `borrowBaseAsset`/
  `returnBaseAsset`, `createAndShareBalanceManager`, `stake`) must be confirmed in the
  installed package, not from memory. The SDK shows a `SuiGrpcClient` migration in progress.
- **`@mysten/sui` 2.x** — confirm the client/transaction API against the 2.0 migration
  guide; the eval apps used ^2.5.1 with deepbook-v3 ^1.3.0, lesson 01 uses ^2.14.1.
- The sandbox must be deployed (`pnpm deploy-all --quick`) before the live suite runs;
  `localnet.json` only exists after a successful deploy.
- DEEP↔asset conversion / fee math depends on the sandbox's whitelisted DEEP price pool;
  assert ranges, not exact figures, in tests.
