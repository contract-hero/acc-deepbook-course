# Section 1 — Connect: manifest to a DeepBook client

Before you can trade you need a client that knows where DeepBook lives on *this* sandbox. Every package ID, coin type, and pool ID is written into a deployment manifest when the sandbox boots. Your job: turn that manifest into a configured DeepBook client.

## What you'll write

The first half of `src/sandbox.ts`:

- `loadManifest()` — read `deployments/localnet.json` (path from `DEEPBOOK_SANDBOX_DEPLOYMENTS`, else the default sandbox checkout) and parse it into a typed `DeploymentManifest`. Throw an actionable error if it's missing — that's the "is the sandbox up?" signal.
- `buildPackageIds` / `buildCoinMap` / `buildPoolMap` — pull the IDs the SDK needs out of the manifest.
- `createClient(address, manifest)` — construct the client.

## The key moment

**`new SuiGrpcClient(...).$extend(deepbook({ ... }))`.**

The base client only speaks raw Sui. The `deepbook(...)` extension is what grafts `client.deepbook.deepBook.*` onto it — and everything it needs comes from the manifest:

```ts
function createClient(address: string, manifest: DeploymentManifest): SandboxClient {
  return new SuiGrpcClient({ network: "custom", baseUrl: LOCALNET_URL }).$extend(
    deepbook({
      address,
      packageIds: buildPackageIds(manifest),
      coins: buildCoinMap(manifest),
      pools: buildPoolMap(manifest),
    }),
  );
}
```

Two non-obvious traps:

1. **`extractObjectId(objects, "Registry", "MarginRegistry")`.** The deepbook package ships *both* a `Registry` and a `MarginRegistry`. Match on `"Registry"` without excluding `"MarginRegistry"` and you may bind the wrong object — the exclude argument is not optional decoration.
2. **Coin scalars.** `DEEP` has 6 decimals (`scalar: 1_000_000`), `SUI` has 9 (`scalar: 1_000_000_000`). These convert human units ↔ chain u64. Get one wrong and your `0.1 SUI` swap silently becomes `0.0000001` or `100000` SUI.

## Verification

This section has no isolated test — it's exercised by every later test through `setupSandbox()`. If `assertSandboxUp()` throws, your manifest path or parse is wrong before anything else can run.
