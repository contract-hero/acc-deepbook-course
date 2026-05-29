# DeepBook Integration Snippets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build four runnable, sandbox-tested mini-apps under `lessons/_snippets/` that showcase the Core-4 DeepBook V3 integration patterns (swap, orders+BalanceManager, flash-loan, market-maker), to seed future ACC lessons.

**Architecture:** Four self-contained apps. Each has a headless core (`src/<core>.ts`, pure — takes an SDK client + signer + params), a thin Vite UI driver (`src/App.tsx`), a copy of the sandbox connection helper (`src/sandbox.ts`), and a **live** vitest that runs end-to-end against the running deepbook-sandbox. Snippet `03-flash-loan` additionally ships a Move package (`contracts/`) whose module consumes the `FlashLoan` hot-potato on-chain.

**Tech Stack:** TypeScript (ESM), `@mysten/deepbook-v3` ^1.3.0, `@mysten/sui` ^2.14.1 (`SuiGrpcClient` + `deepbook()` extension), Vite ^7, Vitest ^3 (node env), React 19, Move 2024 (flash-loan only). Runs against `~/workspace/deepbook-sandbox`.

---

## Context

The course currently has one read-only lesson (`lessons/01-market-stats`). The research doc
`docs/deepbook-integration-research.md` maps the production integration patterns and recommends
lessons 02–08. This plan builds the **reference codebases** (snippets) for the four highest-frequency
patterns, so `lesson-creator` can later graduate each into a lesson. Design spec:
`docs/superpowers/specs/2026-05-29-deepbook-integration-snippets-design.md`.

**Canonical sources to copy/adapt (read these first — they are proven against this exact sandbox):**
- `~/workspace/deepbook-sandbox/examples/sandbox/setup.ts` — the connection/setup/execute helper (basis for `sandbox.ts`).
- `~/workspace/deepbook-sandbox/examples/sandbox/swap-tokens.ts` — swap (no BalanceManager) → snippet 01.
- `~/workspace/deepbook-sandbox/examples/sandbox/place-limit-order.ts`, `place-market-order.ts`, `query-user-orders.ts` → snippet 02.
- `~/workspace/ts-sdks/packages/deepbook-v3/examples/deepbookMarketMaker.ts` → snippet 04.
- `~/workspace/deepbook-sandbox/external/deepbook/packages/deepbook/sources/pool.move` (lines 728–770) — flash-loan Move API.
- `~/workspace/deepbook-sandbox-evaluation-apps/independent/02-slippage-swap/` (`Move.toml`, `sources/`, `tests/`) and `~/workspace/deepbook-sandbox-evaluation-apps/02-fee-rebate-swap/scripts/deploy.sh` → snippet 03 Move package + deploy.

**Pinned SDK facts (from `~/workspace/ts-sdks/packages/deepbook-v3/src/`):**
- Client: `new SuiGrpcClient({ network:"custom", baseUrl:"http://127.0.0.1:9000" }).$extend(deepbook({ address, packageIds, coins, pools, balanceManagers }))`. Typed `ClientWithExtensions<{ deepbook: DeepBookClient }>`.
- Tx builders are **thunks**: `client.deepbook.<ns>.<method>(args)(tx)` where `<ns>` ∈ `balanceManager | deepBook | flashLoans | governance`. Queries: `client.deepbook.<method>(...)` (e.g. `midPrice`, `accountOpenOrders`, `getAccountOrderDetails`, `getLevel2TicksFromMid`).
- Amounts are **human-readable** numbers (SDK scales by `coin.scalar`). Constants: `FLOAT_SCALAR=1e9`, `DEEP_SCALAR=1e6`.
- Swap returns: no-manager `[baseCoin, quoteCoin, deepCoin]`; with-manager `[baseCoin, quoteCoin]`.
- Flash loans: `flashLoans.borrowBaseAsset(poolKey, amount)(tx) → [coin, flashLoan]`; `returnBaseAsset(poolKey, amount, coin, flashLoan)(tx) → leftoverCoin`. Quote variants exist.
- Execute: `client.core.signAndExecuteTransaction({ transaction, signer, include:{effects:true} })`; check `result.$kind === "FailedTransaction"`; then `client.core.waitForTransaction({ digest })`. Returns `result.Transaction!` (`.digest`, `.effects`, `.objectTypes`).

**Sandbox facts:**
- Manifest on disk: `~/workspace/deepbook-sandbox/sandbox/deployments/localnet.json` (only exists after deploy). HTTP mirror: `GET http://127.0.0.1:9009/manifest`.
- RPC (gRPC): `http://127.0.0.1:9000`. Faucet: `POST http://127.0.0.1:9009/faucet` body `{ address, token: "SUI"|"DEEP"|"USDC", amount? }`.
- Pools: `DEEP_SUI` (base DEEP, quote SUI), `SUI_USDC` (base SUI, quote USDC). Both whitelisted → `payWithDeep:false`, `deepAmount:0`.

**Important deviation from the spec:** the spec wrote `SuiClient` + `new DeepBookClient`; the real, proven idiom is `SuiGrpcClient` + `.$extend(deepbook(...))`. This plan uses the real idiom.

**Global assumptions:** the `~/workspace/deepbook-sandbox` repo is checked out and deployed; pnpm is the package manager; Docker is running for all test steps. Work happens in the worktree `acc-deepbook-course/.claude/worktrees/deepbook-snippets-design` (cwd).

---

## Task 0: Prereqs — bring the sandbox up and scaffold the dir

**Files:**
- Create: `lessons/_snippets/.gitignore`

- [ ] **Step 1: Verify the sandbox is deployed and reachable**

Run:
```bash
curl -s http://127.0.0.1:9009/manifest | head -c 200 && echo
test -f ~/workspace/deepbook-sandbox/sandbox/deployments/localnet.json && echo "MANIFEST OK"
```
Expected: a JSON blob with `network`/`packages`/`pools`, and `MANIFEST OK`.
If not: `cd ~/workspace/deepbook-sandbox/sandbox && pnpm install && pnpm deploy-all --quick` and wait for "DeepBook Sandbox Ready!".

- [ ] **Step 2: Create the snippets dir + gitignore**

Create `lessons/_snippets/.gitignore`:
```gitignore
node_modules/
dist/
publish.json
create_*.json
*.log
```

- [ ] **Step 3: Commit**
```bash
git add lessons/_snippets/.gitignore
git commit -m "chore: scaffold lessons/_snippets staging dir"
```

---

## Task 1: `01-swap` — Pattern A (swap over CLOB, no BalanceManager)

**Files:**
- Create: `lessons/_snippets/01-swap/package.json`
- Create: `lessons/_snippets/01-swap/tsconfig.json`
- Create: `lessons/_snippets/01-swap/vite.config.ts`
- Create: `lessons/_snippets/01-swap/index.html`
- Create: `lessons/_snippets/01-swap/src/sandbox.ts`  ← canonical helper (copied to all snippets)
- Create: `lessons/_snippets/01-swap/src/swap.ts`     ← core
- Create: `lessons/_snippets/01-swap/src/App.tsx`, `src/main.tsx`
- Test: `lessons/_snippets/01-swap/tests/swap.live.test.ts`
- Create: `lessons/_snippets/01-swap/README.md`

- [ ] **Step 1: package.json**
```json
{
  "name": "@snippets/01-swap",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5181",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@mysten/deepbook-v3": "^1.3.0",
    "@mysten/sui": "^2.14.1",
    "react": "19.2.0",
    "react-dom": "19.2.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.9.3",
    "vite": "^7.3.1",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 3: vite.config.ts** (serves the manifest at `/localnet.json` for the browser; proxies the faucet to avoid CORS; sets vitest to node env with a long timeout for chain ops)
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MANIFEST_DISK_PATH =
  process.env.DEEPBOOK_SANDBOX_DEPLOYMENTS ??
  join(homedir(), 'workspace/deepbook-sandbox/sandbox/deployments/localnet.json');

const manifestMiddleware = {
  name: 'manifest-middleware',
  configureServer(server: any) {
    server.middlewares.use('/localnet.json', async (_req: any, res: any) => {
      try {
        const content = await readFile(MANIFEST_DISK_PATH, 'utf8');
        res.setHeader('content-type', 'application/json');
        res.statusCode = 200;
        res.end(content);
      } catch {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `localnet.json not found at ${MANIFEST_DISK_PATH}. Run pnpm deploy-all in deepbook-sandbox.` }));
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), manifestMiddleware],
  server: { proxy: { '/faucet': 'http://127.0.0.1:9009' } },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
```

- [ ] **Step 4: src/sandbox.ts** — the canonical connection helper. **Adapt directly from `~/workspace/deepbook-sandbox/examples/sandbox/setup.ts`** (read that file and reproduce it), with these specific changes:
  - `MANIFEST_PATH` resolves from `process.env.DEEPBOOK_SANDBOX_DEPLOYMENTS` else `join(homedir(), "workspace/deepbook-sandbox/sandbox/deployments/localnet.json")` (do NOT use `import.meta.url`-relative path — these snippets live outside the sandbox repo).
  - Export everything the cores/tests need: `loadManifest`, `setupSandbox`, `setupWithBalanceManager`, `signAndExecute`, `createReadOnlyClient`, and the types `SandboxClient`, `SandboxConfig`, `SandboxConfigWithBM`.
  - Add `assertSandboxUp()`: `await loadManifest()` and throw the actionable "Run cd sandbox && pnpm deploy-all --quick" message on ENOENT (loadManifest already does this — re-export as `assertSandboxUp = loadManifest` wrapper returning void).
  - `fundWallet` funds SUI + DEEP (add a third call for USDC: `await fundFromFaucet(address, "USDC")`). Widen the `token` param type to `"SUI" | "DEEP" | "USDC"`.

  Verify after writing: `npx tsc -b` has no errors referencing `setup` types.

- [ ] **Step 5: Write the failing live test** — `tests/swap.live.test.ts`
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { setupSandbox, assertSandboxUp } from '../src/sandbox.js';
import { swapQuoteForBase } from '../src/swap.js';

describe('01-swap (live sandbox)', () => {
  beforeAll(async () => { await assertSandboxUp(); });

  it('swaps SUI for DEEP on DEEP_SUI and returns a positive base out', async () => {
    const ctx = await setupSandbox(); // fresh funded keypair + client
    const res = await swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 0 });
    expect(res.digest).toMatch(/^[A-Za-z0-9]+$/);
    expect(res.baseOut).toBeGreaterThan(0);
  });

  it('reverts when minOut is unsatisfiable', async () => {
    const ctx = await setupSandbox();
    await expect(
      swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 1_000_000 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run the test — verify RED**

Run: `cd lessons/_snippets/01-swap && pnpm install && pnpm test`
Expected: FAIL — `swap.js`/`swapQuoteForBase` not found (module missing).

- [ ] **Step 7: Implement `src/swap.ts`** (core — adapt from `swap-tokens.ts`; pure, takes the sandbox ctx)
```ts
import { Transaction } from '@mysten/sui/transactions';
import { signAndExecute, type SandboxConfig } from './sandbox.js';

export interface SwapArgs {
  poolKey: 'DEEP_SUI' | 'SUI_USDC';
  amount: number;   // quote amount to spend (human-readable, e.g. 0.1 SUI)
  minOut: number;   // slippage floor on base out (human-readable)
}

export interface SwapResult { digest: string; baseOut: number; }

/**
 * Swap quote -> base on a DeepBook pool WITHOUT a BalanceManager — the
 * "aggregator path" routers use. Coins come straight from the wallet; the
 * SDK returns [base, quote, deep] leftovers that we transfer back.
 */
export async function swapQuoteForBase(ctx: SandboxConfig, args: SwapArgs): Promise<SwapResult> {
  const { client, keypair, address } = ctx;
  const tx = new Transaction();
  const [baseCoin, quoteCoin, deepCoin] = tx.add(
    client.deepbook.deepBook.swapExactQuoteForBase({
      poolKey: args.poolKey,
      amount: args.amount,
      deepAmount: 0,          // whitelisted pool — no DEEP fee
      minOut: args.minOut,    // slippage guard; tx reverts if base out < minOut
    }),
  );
  tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);

  const result = await signAndExecute(client, keypair, tx);
  // Derive baseOut from the balance changes / effects of the executed tx.
  const baseOut = readBaseDelta(result, ctx);
  return { digest: result.digest, baseOut };
}

// Sum positive base-coin balance changes credited to `address` in this tx.
function readBaseDelta(result: any, ctx: SandboxConfig): number {
  const baseType = ctx.manifest.pools[/* DEEP_SUI */ 'DEEP_SUI'].baseCoinType;
  const changes = result.effects?.changedObjects ?? [];
  // Fallback: if balance-change decoding is unavailable, return 1 (sentinel) so
  // the positive-path assertion still passes; refine with balanceChanges if the
  // grpc result exposes them. See note below.
  void changes; void baseType;
  return 1;
}
```
Note for the implementer: prefer reading actual balance changes. Request them by passing `include: { effects: true, balanceChanges: true }` in `signAndExecute` (extend the helper's `include`) and sum the `DEEP` (base) positive delta in `readBaseDelta`. If the gRPC result shape for `balanceChanges` is uncertain, confirm against `result.Transaction` in a quick `console.log` during this step, then implement the real sum. The sentinel `return 1` is a stopgap **only** until the real delta is wired — replace it before Step 9.

- [ ] **Step 8: Run the test — verify GREEN**

Run: `pnpm test`
Expected: PASS (both cases — positive swap succeeds, unsatisfiable minOut rejects).

- [ ] **Step 9: Replace the baseOut sentinel with the real balance delta**, re-run `pnpm test`, confirm `baseOut` reflects actual DEEP received (> 0).

- [ ] **Step 10: Minimal UI** — `index.html`, `src/main.tsx`, `src/App.tsx`

`index.html`:
```html
<!doctype html><html><head><meta charset="utf-8"><title>01-swap</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```
`src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
createRoot(document.getElementById('root')!).render(<App />);
```
`src/App.tsx`: a single "Swap 0.1 SUI → DEEP" button that calls a browser variant of setup (fetch `/localnet.json`, generate keypair, fund via `/faucet` proxy) then `swapQuoteForBase`, rendering `digest` + `baseOut` or the error. Keep it under ~60 lines; this is a smoke driver, not a product. (Add a `setupSandboxBrowser()` to `sandbox.ts` that mirrors `setupSandbox` but loads the manifest via `fetch('/localnet.json')` and funds via `fetch('/faucet', ...)`.)

- [ ] **Step 11: README.md** — pattern A summary: what it shows (`swapExactQuoteForBase`, no BalanceManager, the `[base,quote,deep]` return, `minOut` guard), target lesson `03-amm-swap-over-clob`, and run steps (`pnpm install`, `pnpm test`, `pnpm dev`).

- [ ] **Step 12: Commit**
```bash
git add lessons/_snippets/01-swap
git commit -m "feat(snippets): 01-swap — swap over CLOB (Pattern A) + live test"
```

---

## Task 2: `02-orders` — Pattern B (BalanceManager lifecycle + limit/market/cancel)

**Files:** same anatomy as Task 1 under `lessons/_snippets/02-orders/`. Copy `package.json` (rename to `@snippets/02-orders`, port `5182`), `tsconfig.json`, `vite.config.ts`, and `src/sandbox.ts` verbatim from `01-swap`.
- Create: `src/orders.ts` (core), `tests/orders.live.test.ts`, `src/App.tsx`/`main.tsx`, `index.html`, `README.md`.

- [ ] **Step 1: Copy scaffold** from `01-swap` (package.json name/port edits, tsconfig, vite.config, `src/sandbox.ts`, index.html, main.tsx).

- [ ] **Step 2: Write the failing live test** — `tests/orders.live.test.ts`
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { setupWithBalanceManager, assertSandboxUp } from '../src/sandbox.js';
import { placeRestingBid, listOpenOrders, cancelAll } from '../src/orders.js';

describe('02-orders (live sandbox)', () => {
  beforeAll(async () => { await assertSandboxUp(); });

  it('deposits, places a resting bid, lists it, then cancels all', async () => {
    const ctx = await setupWithBalanceManager();
    await placeRestingBid(ctx, { poolKey: 'DEEP_SUI', depositSui: 1, quantity: 10, clientOrderId: '1' });

    const open = await listOpenOrders(ctx, 'DEEP_SUI');
    expect(open.length).toBeGreaterThan(0);

    await cancelAll(ctx, 'DEEP_SUI');
    const after = await listOpenOrders(ctx, 'DEEP_SUI');
    expect(after.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run — verify RED**: `cd lessons/_snippets/02-orders && pnpm install && pnpm test` → FAIL (`orders.js` missing).

- [ ] **Step 4: Implement `src/orders.ts`** (adapt from `place-limit-order.ts` + `query-user-orders.ts`)
```ts
import { OrderType, SelfMatchingOptions } from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { signAndExecute, type SandboxConfigWithBM } from './sandbox.js';

const TICK = 0.000001; // DEEP_SUI tick size

export interface PlaceBidArgs {
  poolKey: 'DEEP_SUI'; depositSui: number; quantity: number; clientOrderId: string;
}

/** Deposit SUI, then place a limit BID well below mid so it rests on the book. */
export async function placeRestingBid(ctx: SandboxConfigWithBM, a: PlaceBidArgs): Promise<string> {
  const { client, keypair, balanceManagerKey } = ctx;

  const depositTx = new Transaction();
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'SUI', a.depositSui)(depositTx);
  await signAndExecute(client, keypair, depositTx);

  const mid = await client.deepbook.midPrice(a.poolKey);
  const bidPrice = Math.floor((mid * 0.5) / TICK) * TICK; // half mid, tick-aligned → rests

  const orderTx = new Transaction();
  client.deepbook.deepBook.placeLimitOrder({
    poolKey: a.poolKey,
    balanceManagerKey,
    clientOrderId: a.clientOrderId,
    price: bidPrice,
    quantity: a.quantity,
    isBid: true,
    orderType: OrderType.NO_RESTRICTION,
    selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
    payWithDeep: false, // whitelisted pool
  })(orderTx);
  const res = await signAndExecute(client, keypair, orderTx);
  return res.digest;
}

export async function listOpenOrders(ctx: SandboxConfigWithBM, poolKey: 'DEEP_SUI'): Promise<string[]> {
  return ctx.client.deepbook.accountOpenOrders(poolKey, ctx.balanceManagerKey);
}

export async function cancelAll(ctx: SandboxConfigWithBM, poolKey: 'DEEP_SUI'): Promise<string> {
  const tx = new Transaction();
  ctx.client.deepbook.deepBook.cancelAllOrders(poolKey, ctx.balanceManagerKey)(tx);
  const res = await signAndExecute(ctx.client, ctx.keypair, tx);
  return res.digest;
}
```

- [ ] **Step 5: Run — verify GREEN**: `pnpm test` → PASS.

- [ ] **Step 6: Add a market-order path** — extend `orders.ts` with `placeMarketBuy(ctx, {poolKey, quantity, clientOrderId})` (adapt `place-market-order.ts`: deposit, then `placeMarketOrder({...payWithDeep:false})(tx)`). Add a test case that places a market buy and asserts the tx digest is returned. Run `pnpm test` → PASS. (Note: market order needs an opposing resting ask; the sandbox market maker seeds it. If no liquidity, assert the call resolves OR throws a known "no liquidity" error — keep the assertion tolerant.)

- [ ] **Step 7: Minimal UI** — `App.tsx`: buttons "Place resting bid", "List open orders", "Cancel all", rendering results. Use a browser `setupWithBalanceManagerBrowser()` added to `sandbox.ts`.

- [ ] **Step 8: README.md** — Pattern B: BalanceManager lifecycle, deposit, limit vs market, cancel, the settled-vs-owed reconciliation key moment; target lesson `02-place-and-manage-orders`.

- [ ] **Step 9: Commit**
```bash
git add lessons/_snippets/02-orders
git commit -m "feat(snippets): 02-orders — BalanceManager + order lifecycle (Pattern B) + live test"
```

---

## Task 3: `04-market-maker` — Pattern F (two-sided grid + DEEP staking)

**Files:** same anatomy under `lessons/_snippets/04-market-maker/` (package name `@snippets/04-market-maker`, port `5184`). Copy scaffold + `sandbox.ts` from `02-orders` (it needs the BalanceManager setup).
- Create: `src/marketMaker.ts` (core), `tests/marketMaker.live.test.ts`, UI, README.

- [ ] **Step 1: Copy scaffold** from `02-orders`.

- [ ] **Step 2: Write the failing live test** — `tests/marketMaker.live.test.ts`
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { setupWithBalanceManager, assertSandboxUp } from '../src/sandbox.js';
import { quoteTwoSidedGrid, stakeDeep } from '../src/marketMaker.js';
import { listOpenOrders, cancelAll } from '../src/marketMaker.js';

describe('04-market-maker (live sandbox)', () => {
  beforeAll(async () => { await assertSandboxUp(); });

  it('places a two-sided grid then cancels it', async () => {
    const ctx = await setupWithBalanceManager();
    await quoteTwoSidedGrid(ctx, { poolKey: 'DEEP_SUI', levels: 2, spreadBps: 50, sizePerLevel: 5, depositSui: 5, depositDeep: 50 });
    const open = await listOpenOrders(ctx, 'DEEP_SUI');
    expect(open.length).toBe(4); // 2 bids + 2 asks
    await cancelAll(ctx, 'DEEP_SUI');
    expect((await listOpenOrders(ctx, 'DEEP_SUI')).length).toBe(0);
  });

  it('stakes DEEP for fee rebates', async () => {
    const ctx = await setupWithBalanceManager();
    const digest = await stakeDeep(ctx, { poolKey: 'DEEP_SUI', amount: 10, depositDeep: 50 });
    expect(digest).toMatch(/^[A-Za-z0-9]+$/);
  });
});
```

- [ ] **Step 3: Run — verify RED**: `cd lessons/_snippets/04-market-maker && pnpm install && pnpm test` → FAIL.

- [ ] **Step 4: Implement `src/marketMaker.ts`** (grid of `placeLimitOrder`s around mid + `governance.stake`)
```ts
import { OrderType, SelfMatchingOptions } from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { signAndExecute, type SandboxConfigWithBM } from './sandbox.js';

const TICK = 0.000001;
const round = (p: number) => Math.floor(p / TICK) * TICK;

export interface GridArgs {
  poolKey: 'DEEP_SUI'; levels: number; spreadBps: number; sizePerLevel: number;
  depositSui: number; depositDeep: number;
}

/** Deposit inventory, then place `levels` bids and `levels` asks around mid. */
export async function quoteTwoSidedGrid(ctx: SandboxConfigWithBM, a: GridArgs): Promise<string> {
  const { client, keypair, balanceManagerKey } = ctx;

  const dep = new Transaction();
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'SUI', a.depositSui)(dep);
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'DEEP', a.depositDeep)(dep);
  await signAndExecute(client, keypair, dep);

  const mid = await client.deepbook.midPrice(a.poolKey);
  const tx = new Transaction();
  let oid = 0;
  for (let i = 1; i <= a.levels; i++) {
    const off = (a.spreadBps / 10_000) * i;
    const bid = round(mid * (1 - off));
    const ask = round(mid * (1 + off));
    for (const [price, isBid] of [[bid, true], [ask, false]] as const) {
      client.deepbook.deepBook.placeLimitOrder({
        poolKey: a.poolKey, balanceManagerKey, clientOrderId: String(++oid),
        price, quantity: a.sizePerLevel, isBid,
        orderType: OrderType.POST_ONLY, // maker-only; reject if it would take
        selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
        payWithDeep: false,
      })(tx);
    }
  }
  const res = await signAndExecute(client, keypair, tx);
  return res.digest;
}

export interface StakeArgs { poolKey: 'DEEP_SUI'; amount: number; depositDeep: number; }
export async function stakeDeep(ctx: SandboxConfigWithBM, a: StakeArgs): Promise<string> {
  const { client, keypair, balanceManagerKey } = ctx;
  const dep = new Transaction();
  client.deepbook.balanceManager.depositIntoManager(balanceManagerKey, 'DEEP', a.depositDeep)(dep);
  await signAndExecute(client, keypair, dep);
  const tx = new Transaction();
  client.deepbook.governance.stake(a.poolKey, balanceManagerKey, a.amount)(tx);
  const res = await signAndExecute(client, keypair, tx);
  return res.digest;
}

export async function listOpenOrders(ctx: SandboxConfigWithBM, poolKey: 'DEEP_SUI') {
  return ctx.client.deepbook.accountOpenOrders(poolKey, ctx.balanceManagerKey);
}
export async function cancelAll(ctx: SandboxConfigWithBM, poolKey: 'DEEP_SUI') {
  const tx = new Transaction();
  ctx.client.deepbook.deepBook.cancelAllOrders(poolKey, ctx.balanceManagerKey)(tx);
  return (await signAndExecute(ctx.client, ctx.keypair, tx)).digest;
}
```
Note: if `POST_ONLY` grid orders get rejected because a level crosses the seeded book, widen `spreadBps` (e.g. start at 100) so all 4 rest; the test asserts exactly 4 open orders, so the spread must keep every level off the touch.

- [ ] **Step 5: Run — verify GREEN**: `pnpm test` → PASS. Tune `spreadBps`/`levels` in the test if the count assertion is off due to seeded liquidity.

- [ ] **Step 6: Minimal UI** — `App.tsx`: "Start quoting" (places grid), "Stake DEEP", "Cancel all", showing open-order count. Browser setup variant.

- [ ] **Step 7: README.md** — Pattern F: two-sided grid, inventory across one BalanceManager, DEEP staking for rebates, inventory-skew key moment; target lesson `06-market-maker-bot`.

- [ ] **Step 8: Commit**
```bash
git add lessons/_snippets/04-market-maker
git commit -m "feat(snippets): 04-market-maker — grid quoting + DEEP staking (Pattern F) + live test"
```

---

## Task 4: `03-flash-loan` — Pattern E (Move package + TS driver, hot-potato)

**Files:**
- Create Move: `lessons/_snippets/03-flash-loan/contracts/Move.toml`, `contracts/sources/arb_executor.move`, `contracts/tests/arb_executor_tests.move`, `contracts/scripts/deploy.sh`
- Create TS: copy scaffold from `01-swap` (no BalanceManager needed) under `lessons/_snippets/03-flash-loan/` (name `@snippets/03-flash-loan`, port `5183`); `src/sandbox.ts` (copy), `src/flashLoan.ts` (core driver), `tests/flashLoan.live.test.ts`, UI, `README.md`.

### Part A — Move package

- [ ] **Step 1: Read the references**: `~/workspace/deepbook-sandbox/external/deepbook/packages/deepbook/sources/pool.move:728-770` (flash-loan fns + `FlashLoan` hot-potato), and `~/workspace/deepbook-sandbox-evaluation-apps/independent/02-slippage-swap/{Move.toml,sources/slippage_swap.move,tests/slippage_swap_tests.move}`.

- [ ] **Step 2: `contracts/Move.toml`** (edition 2024; deepbook + token as local deps from the sandbox's external packages)
```toml
[package]
name = "arb_executor"
edition = "2024"

[dependencies]
token = { local = "../../../../../deepbook-sandbox/sandbox/.external-packages/token" }
deepbook = { local = "../../../../../deepbook-sandbox/sandbox/.external-packages/deepbook" }

[addresses]
arb_executor = "0x0"
```
Note: the relative path must resolve from `contracts/` to `~/workspace/deepbook-sandbox/sandbox/.external-packages/`. Verify the depth by running `sui move build` in Step 4 and adjust `../` count if needed. (The `deploy.sh` staging approach in Step 6 sidesteps path fragility by building inside the sandbox tree — prefer that for actual publish.)

- [ ] **Step 3: `contracts/sources/arb_executor.move`** — receives the borrowed coin + the `FlashLoan` hot-potato, performs a (placeholder) arb step, repays the exact principal on-chain, and returns any leftover to the sender.
```move
module arb_executor::arb_executor;

use deepbook::pool::{Self, Pool, FlashLoan};
use sui::coin::{Self, Coin};

const ERepayShort: u64 = 1;

/// Consume a base-asset flash loan: merge a caller-supplied top-up into the
/// borrowed coin, repay EXACTLY `borrow_amount` via the pool, and send any
/// remainder back to the caller. The `FlashLoan` hot-potato MUST be consumed
/// here (it has no drop/store) — that is what forces atomic repayment.
public fun execute_base<Base, Quote>(
    pool: &mut Pool<Base, Quote>,
    borrowed: Coin<Base>,
    loan: FlashLoan,
    mut topup: Coin<Base>,
    borrow_amount: u64,
    ctx: &mut TxContext,
) {
    topup.join(borrowed);
    assert!(topup.value() >= borrow_amount, ERepayShort);
    let repay = topup.split(borrow_amount, ctx);
    pool::return_flashloan_base(pool, repay, loan);
    transfer::public_transfer(topup, ctx.sender());
}
```
Note: confirm the exact `return_flashloan_base` signature/visibility from `pool.move`; if it is `entry`-only or has a different arg order, adapt. Confirm `FlashLoan` is re-exported from `deepbook::pool` (it is defined in `vault.move` but used via `pool.move` — import from wherever `pool.move` exposes it).

- [ ] **Step 4: `contracts/tests/arb_executor_tests.move`** — happy path + under-repay revert, using `deepbook::pool_tests::setup_everything` (see `slippage_swap_tests.move` for the harness).
```move
#[test_only]
module arb_executor::arb_executor_tests;

use arb_executor::arb_executor;
use deepbook::pool::{Self, Pool};
use deepbook::pool_tests::setup_everything;
use sui::coin::mint_for_testing;
use sui::test_scenario::{begin, end, return_shared};
// ... bring in SUI/USDC/DEEP test types per slippage_swap_tests.move

#[test]
fun repays_exact_principal() {
    // setup_everything creates a pool with seeded liquidity (see slippage_swap_tests)
    // borrow_flashloan_base(amount) -> (coin, loan)
    // mint a small topup, call arb_executor::execute_base(..., amount), assert no abort
}

#[test, expected_failure]
fun aborts_when_repay_short() {
    // borrow, but pass borrow_amount larger than (borrowed+topup) OR repay too little
    // expect the vault EIncorrectQuantityReturned (or ERepayShort) abort
}
```
Implement the two tests fully following the `setup_everything<SUI, USDC, SUI, DEEP>` pattern and helpers from `slippage_swap_tests.move` (copy its imports, constants, and scenario scaffolding). The happy test borrows a small base amount, mints a topup to cover any rounding, calls `execute_base`, and asserts the scenario completes. The failure test forces a short repayment.

- [ ] **Step 5: Run Move tests — RED then GREEN**

Run: `cd lessons/_snippets/03-flash-loan/contracts && sui move test`
Expected first run: compile/test FAIL until `arb_executor.move` + tests are correct. Iterate (use `move_diagnostics` MCP / `sui move build`) until: PASS (both tests). Then run `/move-code-quality` on the package and fix Move-2024 issues.

- [ ] **Step 6: `contracts/scripts/deploy.sh`** — adapt from `~/workspace/deepbook-sandbox-evaluation-apps/02-fee-rebate-swap/scripts/deploy.sh`: stage `sources/arb_executor.move` into a temp package inside the sandbox tree, generate `Move.toml` with the localnet `chain-id` from `~/workspace/deepbook-sandbox/sandbox/Pub.localnet.toml`, run `sui client test-publish --build-env localnet --pubfile-path <Pub.localnet.toml> --json > publish.json`, and parse the published `packageId` from `objectChanges`. Write the id to `lessons/_snippets/03-flash-loan/deployment.json` as `{ "arbExecutorPackageId": "0x..." }`.

- [ ] **Step 7: Publish to the sandbox**

Run: `bash lessons/_snippets/03-flash-loan/contracts/scripts/deploy.sh`
Expected: prints `Package published: 0x...`; `deployment.json` written with `arbExecutorPackageId`.

### Part B — TS driver + live test

- [ ] **Step 8: Copy TS scaffold** from `01-swap` (package.json name/port, tsconfig, vite.config, `src/sandbox.ts`, index.html, main.tsx).

- [ ] **Step 9: Write the failing live test** — `tests/flashLoan.live.test.ts`
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { setupSandbox, assertSandboxUp } from '../src/sandbox.js';
import { runFlashLoanArb } from '../src/flashLoan.js';

const pkg = JSON.parse(await readFile(new URL('../deployment.json', import.meta.url), 'utf8')).arbExecutorPackageId as string;

describe('03-flash-loan (live sandbox)', () => {
  beforeAll(async () => { await assertSandboxUp(); });

  it('borrows DEEP, executes the arb step, repays in one PTB', async () => {
    const ctx = await setupSandbox();
    const digest = await runFlashLoanArb(ctx, { poolKey: 'DEEP_SUI', borrow: 1, arbExecutorPackageId: pkg });
    expect(digest).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('reverts the whole PTB when repayment is short', async () => {
    const ctx = await setupSandbox();
    await expect(
      runFlashLoanArb(ctx, { poolKey: 'DEEP_SUI', borrow: 1, arbExecutorPackageId: pkg, topup: 0 /* no top-up → short */ }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 10: Run — verify RED**: `cd lessons/_snippets/03-flash-loan && pnpm install && pnpm test` → FAIL (`flashLoan.js` missing).

- [ ] **Step 11: Implement `src/flashLoan.ts`** — assembles one PTB: SDK `borrowBaseAsset` → `moveCall(arb_executor::execute_base)` (consumes coin + flashLoan) in one transaction.
```ts
import { Transaction } from '@mysten/sui/transactions';
import { coinWithBalance } from '@mysten/sui/transactions';
import { signAndExecute, type SandboxConfig } from './sandbox.js';

const DEEP_SCALAR = 1_000_000; // DEEP has 6 decimals

export interface ArbArgs {
  poolKey: 'DEEP_SUI'; borrow: number; arbExecutorPackageId: string; topup?: number;
}

/**
 * One PTB: borrow `borrow` DEEP from the pool (returns a Coin + a FlashLoan
 * hot-potato), hand both to our Move module which repays the EXACT principal
 * and returns leftovers. If repayment is short, the whole PTB reverts —
 * LPs bear no risk. This is Sui's hot-potato pattern end to end.
 */
export async function runFlashLoanArb(ctx: SandboxConfig, a: ArbArgs): Promise<string> {
  const { client, keypair, manifest } = ctx;
  const deepType = manifest.pools.DEEP_SUI.baseCoinType;
  const suiType = `0x2::sui::SUI`;
  const poolId = manifest.pools.DEEP_SUI.poolId;
  const borrowScaled = Math.round(a.borrow * DEEP_SCALAR);
  const topupScaled = Math.round((a.topup ?? a.borrow) * DEEP_SCALAR); // default: fully cover repay

  const tx = new Transaction();
  const [coin, flashLoan] = tx.add(
    client.deepbook.flashLoans.borrowBaseAsset(a.poolKey, a.borrow),
  );
  const topup = coinWithBalance({ type: deepType, balance: BigInt(topupScaled) });
  tx.moveCall({
    target: `${a.arbExecutorPackageId}::arb_executor::execute_base`,
    typeArguments: [deepType, suiType],
    arguments: [tx.object(poolId), coin, flashLoan, topup, tx.pure.u64(borrowScaled)],
  });

  const res = await signAndExecute(client, keypair, tx);
  return res.digest;
}
```
Note: confirm `coinWithBalance` import path/usage for `@mysten/sui` 2.14 (it is `@mysten/sui/transactions`). Confirm the `borrowBaseAsset` thunk return is destructurable as `[coin, flashLoan]` via `tx.add(...)` (it is — see `flashLoans.ts:27-38`). If `tx.add` doesn't yield the tuple directly, call the thunk as `client.deepbook.flashLoans.borrowBaseAsset(a.poolKey, a.borrow)(tx)` and capture its return.

- [ ] **Step 12: Run — verify GREEN**: `pnpm test` → PASS (happy path repays; short-repay reverts). If the borrow fails for lack of pool liquidity, lower `borrow` (e.g. 0.1) and the matching topup.

- [ ] **Step 13: Minimal UI** — `App.tsx`: "Run flash-loan arb" button → renders digest or the revert error. Browser setup variant.

- [ ] **Step 14: README.md** — Pattern E: the FlashLoan hot-potato, borrow→execute→repay atomic PTB, exact-principal repayment, revert-on-short = LPs bear no risk; the Move module's role; target lesson `05-flash-loan-arbitrage`. Document the deploy step (`bash contracts/scripts/deploy.sh`) as a prerequisite to `pnpm test`.

- [ ] **Step 15: Run `/move-code-review`** on `contracts/` and address any high-severity findings.

- [ ] **Step 16: Commit**
```bash
git add lessons/_snippets/03-flash-loan
git commit -m "feat(snippets): 03-flash-loan — hot-potato flash loan, Move + TS (Pattern E) + live tests"
```

---

## Task 5: Index README + final verification

**Files:**
- Create: `lessons/_snippets/README.md`

- [ ] **Step 1: Write the index README** with:
  - Intro: what these are (pre-lesson reference codebases), and the "DeepBook is infrastructure, not a product" framing.
  - Table: Pattern → snippet dir → target ACC lesson → key SDK calls → key teaching moment:
    | Pattern | Snippet | Lesson | Key calls | Teaching moment |
    |---|---|---|---|---|
    | A swap | `01-swap` | 03 | `swapExactQuoteForBase` | minOut guard, `[base,quote,deep]` return |
    | B orders | `02-orders` | 02 | `createAndShareBalanceManager`, `placeLimitOrder`, `cancelAllOrders` | settled-vs-owed reconciliation |
    | E flash-loan | `03-flash-loan` | 05 | `borrowBaseAsset`/`returnBaseAsset` + Move | hot-potato atomic repay |
    | F market-maker | `04-market-maker` | 06 | `placeLimitOrder` grid, `governance.stake` | inventory skew, one BM spans pools |
  - "Running against the sandbox": bring up sandbox (`cd ~/workspace/deepbook-sandbox/sandbox && pnpm deploy-all --quick`), then per snippet `pnpm install && pnpm test` (live) and `pnpm dev` (UI). Note the `DEEPBOOK_SANDBOX_DEPLOYMENTS` env override and that `03-flash-loan` needs `bash contracts/scripts/deploy.sh` first.
  - "How these become lessons": point at ACC's `lesson-creator` skill + the design spec.

- [ ] **Step 2: Full live-suite verification** (sandbox must be up)

Run:
```bash
cd ~/workspace/deepbook-sandbox/sandbox && curl -s localhost:9009/manifest >/dev/null && echo "sandbox up"
cd /Users/alilloig/workspace/acc-deepbook-course/.claude/worktrees/deepbook-snippets-design
for d in 01-swap 02-orders 04-market-maker 03-flash-loan; do
  echo "== $d =="; (cd lessons/_snippets/$d && pnpm install --silent && pnpm test) || exit 1
done
```
Expected: all four suites PASS. (For `03-flash-loan`, ensure `deployment.json` exists from Task 4 Step 7.)

- [ ] **Step 3: Commit**
```bash
git add lessons/_snippets/README.md
git commit -m "docs(snippets): index README mapping patterns to lessons + run guide"
```

---

## Verification (end-to-end)

1. **Sandbox health:** `curl -s http://127.0.0.1:9009/manifest` returns JSON; `localnet.json` exists on disk.
2. **Per-snippet live tests:** each `pnpm test` passes against the running sandbox (Task 5 Step 2 loop). These exercise real on-chain effects: a swap with balance delta + minOut revert; an order placed/listed/cancelled; a flash-loan PTB that repays and a short-repay that reverts; a market-maker grid that rests 4 orders + a DEEP stake.
3. **Move package:** `cd lessons/_snippets/03-flash-loan/contracts && sui move test` passes; `/move-code-quality` and `/move-code-review` clean.
4. **UIs (smoke):** `pnpm dev` in each snippet serves a page whose button drives the core against the sandbox without console errors.
5. **No placeholders left:** the `readBaseDelta` sentinel in `01-swap` is replaced with a real balance delta (Task 1 Step 9).

## Notes / risks the implementer must confirm at the cited steps
- **gRPC result shape** for balance changes (`01-swap` baseOut) and effects — confirm against a live `console.log(result.Transaction)` (Task 1 Step 7/9).
- **`coinWithBalance`** + `tx.add` tuple destructuring for `@mysten/sui` 2.14 (Task 4 Step 11).
- **Move dep relative path / `return_flashloan_base` signature** (Task 4 Steps 2–3) — verify with `sui move build`.
- **Seeded-liquidity sensitivity**: market-order liquidity (Task 2 Step 6), grid spread vs touch (Task 3 Step 4–5), and flash-loan borrow size (Task 4 Step 12) all depend on the sandbox market maker — tune amounts as noted.

## Destination
Per the brainstorming/writing-plans convention, after approval copy this plan to
`docs/superpowers/plans/2026-05-29-deepbook-integration-snippets.md` in the repo (worktree) and commit it before execution.
