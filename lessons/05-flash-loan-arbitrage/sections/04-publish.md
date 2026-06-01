# Section 4 — Publish the package

Your Move module isn't callable from TypeScript until it's on-chain. The TS driver reads the published package id from `deployment.json`, so the package must be live on the sandbox's localnet **before** the test can run. This section publishes it.

## What you'll write

`contracts/scripts/deploy.sh` does the work; you run it:

```bash
# DEEPBOOK_SANDBOX_DIR defaults to $HOME/workspace/deepbook-sandbox/sandbox.
# Point it at whichever sandbox tree published the live localnet.
DEEPBOOK_SANDBOX_DIR=$HOME/workspace/deepbook-sandbox/sandbox \
  bash contracts/scripts/deploy.sh
```

It stages the module, publishes against `localnet`, and writes:

```json
{ "arbExecutorPackageId": "0x…" }
```

into `deployment.json`.

## The key moment

**Stage inside the sandbox, and ship NO `[addresses]` block.**

Two non-obvious things make the publish work:

1. **Stage where the deps resolve.** The script copies `sources/arb_executor.move` into `$DEEPBOOK_SANDBOX_DIR/packages/arb_executor/` and generates a `Move.toml` whose `token` / `deepbook` dependencies point at `../../.external-packages/{token,deepbook}`. Publishing from inside the sandbox tree is the only place those relative source deps resolve. It then runs `sui client test-publish -e localnet --pubfile-path .../Pub.localnet.toml` and parses the published `packageId` out of `objectChanges`.

2. **No `[addresses]` block.** `arb_executor` is a *named-address module* (`module arb_executor::arb_executor;`) — its address is bound at publish time via the `localnet` *environment* (the `deepbook` dependency declares one). Add an explicit `[addresses]` block and the build rejects `localnet` with a misleading "Environment `localnet` is not present" error. The environment, not a hard-coded address, is what assigns the module its identity.

```toml
[environments]
localnet = "<chain-id>"   # the live sandbox chain-id; re-genesis ⇒ update it
```

**`deployment.json` is chain-specific.** The package id is only valid on the localnet instance it was published to. Re-genesis or redeploy the sandbox and you must **re-run `deploy.sh`**, or the live test fails against a stale id.

## Verification

After a successful publish, `deployment.json` holds a real `0x…` package id. The live test (`tests/flashLoan.live.test.ts`) reads exactly that field; a missing or stale id surfaces as a publish/lookup failure when the suite runs.
