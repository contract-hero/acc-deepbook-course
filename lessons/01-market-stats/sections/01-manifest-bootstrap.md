# Section 1 — Manifest bootstrap

The DeepBook sandbox writes its deployment state to `sandbox/deployments/localnet.json`. Before we can ask the chain anything, we need to read that file, validate its shape, and produce two things:

1. The `deepbookPackageId` (every later RPC call needs it as a type-arg).
2. A typed list of `PoolDescriptor[]` — one per pool the sandbox deployed.

## What you'll write

- `src/types.ts` — the chain-shape and manifest types. Most of this is data definitions; copy them into place and move on. The shapes mirror what `sandbox/deploy-all.ts` actually emits — don't trust your training memory here, trust `notes/chain-shape.md`.
- `src/manifest.ts` — exports `parseManifest(parsed, sourcePath)` (the pure validator) and `loadManifest(manifestPath)` (the Node fs-based wrapper).

## The key moment

**Write `parseManifest` yourself.** It's a pure JSON-object validator — no I/O. The reason it's pure is that the same function backs two callers:

- `loadManifest()` here in `manifest.ts`, used by Node-side unit tests and CLI tools.
- The browser's `fetch('/localnet.json').then(parseManifest)` path in `main.tsx`.

If you put `fs.readFile` inside the validator, the browser bundle breaks. If you fold validation into each caller, you'll fix the same bugs twice. Keep the validator pure.

The validation rules to enforce:

- `parsed.pools` must be a non-null object — if missing, throw an actionable error that names the bootstrap recipe (`pnpm deploy-all`).
- `parsed.packages.deepbook.packageId` must be a non-empty string — without it, no RPC call can succeed.
- Each pool entry must have `poolId`, `baseCoinType`, and `quoteCoinType`, all non-empty strings.

Throw `Error` instances with actionable messages: tell the user **what** is missing and **what to run** to fix it. The tests assert the error text contains the bootstrap hint.

## Verification

Run `pnpm vitest run tests/manifest.test.ts` — 4 tests cover the validator: pool enumeration, package-id extraction, missing-file error, missing-pools-key error.
