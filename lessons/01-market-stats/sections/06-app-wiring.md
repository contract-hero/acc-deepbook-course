# Section 6 — App wiring

Wire everything together. The React app loads the manifest once, fetches per-pool stats on a 20-second interval, and renders one `PoolCard` per pool.

## What you'll write

- `src/main.tsx` — the Vite entry. Builds a `deps: AppDeps` closure (loadManifest + fetchPoolStats), mounts `<App deps={deps} />`. The closure captures `packageId` once the manifest resolves, so per-pool fetches don't need to re-parse the manifest.
- `src/App.tsx` — two `useEffect`s: an initial-load effect that calls `loadManifest()` and the first `fetchAllPools()`, and a refresh effect that re-runs `fetchAllPools()` every `REFRESH_INTERVAL_MS = 20_000`.

## The key moment

**`Promise.allSettled` + a sentinel card per failed pool.**

Naïve fan-out is `Promise.all(pools.map(fetchPoolStats))`. That has a fatal failure mode: one pool with a transient RPC hiccup rejects the whole array, and the entire dashboard goes blank. For a market-stats viewer that's the worst possible UX — the user can't tell whether the sandbox is down or just one pool is slow.

The fix:

```ts
const settled = await Promise.allSettled(pools.map(p => deps.fetchPoolStats(p)));
const cards = settled.map((r, i) =>
  r.status === 'fulfilled' ? r.value : sentinelCard(pools[i])
);
const poolErrors = settled
  .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  .map(r => r.reason?.message ?? String(r.reason));
```

`sentinelCard` returns a `PoolCardData` with every stat field set to `undefined`. The `PoolCard` component already renders `—` for undefined fields (see section 4), so a broken pool shows up as a row of em-dashes — clearly degraded, but the rest of the dashboard keeps running.

Surface the rejection messages in a `role="alert"` block above the cards so the user can see *why* a pool went sentinel without having to dig through devtools.

Test T-020 enforces this: it injects a `fetchPoolStats` that rejects for one pool only and asserts (a) the dashboard still renders N cards (not 0), (b) the rejected pool's card shows all `—` sentinels, (c) the rejection's message text appears in the alert region.

## Refresh interval

The cycle contract requires sparkline freshness within 30 s. `setInterval` at 20 s gives you headroom for slow RPC. Don't go below 5 s — the localnet sandbox doesn't love being hammered and your tests will start flaking on slow hardware.

## Verification

`pnpm vitest run` — full suite. If this section is wired correctly, all 24 tests pass and the lesson is complete.
