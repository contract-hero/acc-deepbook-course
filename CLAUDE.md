# Sui DeepBook Course

A Claude Code plugin that turns a Claude Code session into an interactive coding tutor for advanced Sui / DeepBook developers. Users register the plugin and type `/sui-deepbook-course:start` — they do **not** run a standalone CLI.

The user-facing onboarding doc is `SUI_DEEPBOOK_COURSE_FOR_DUMMIES.md`. This file is for Claude's context when working on the code.

## What This Actually Is

- A Claude Code plugin manifest (`.claude-plugin/plugin.json`).
- An **MCP server** at `mcp/server/` (TypeScript, ESM, Node 18+, MCP SDK + zod) that exposes seven tools the LLM uses to drive lessons.
- A **course-conductor agent** (`agents/course-conductor.md`) that runs the per-spot loop.
- A **course-engine skill** (`skills/course-engine/SKILL.md`) wired to the `/sui-deepbook-course:start` slash command.
- One **learning path** so far: `paths/01-orderbook-viewer/` (3 phases, TypeScript work against deepbook-sandbox).

There is **no `packages/` monorepo, no Commander.js CLI, no `create-deepbook-course` wrapper, no `@clack/prompts`**. Earlier design notes (`create-mastra-architecture-report.md`) describe a path that was abandoned. Treat them as history, not guidance.

## Tech Stack

- TypeScript (ESM, `"type": "module"`), Node >= 18
- pnpm workspaces — only `mcp/server` is currently a workspace member
- `@modelcontextprotocol/sdk` ^1.0.0
- `zod` for tool input schemas
- `vitest` for tests (run with `pnpm test` from the root)

## Build & Test

```bash
pnpm install                                  # root install
cd mcp/server && pnpm install && pnpm build   # produces dist/index.js
pnpm test                                     # vitest, from root
```

The plugin manifest spawns `node mcp/server/dist/index.js` over stdio, so `pnpm build` is required after any change in `mcp/server/src/`.

## Component Map

| Path | Role |
|---|---|
| `mcp/server/src/index.ts` | MCP entry; registers 7 tools and connects `StdioServerTransport` when run as a script. |
| `mcp/server/src/tools/*.ts` | One file per MCP tool (`start`, `selectPath`, `setPersonalization`, `nextSpot`, `verifySpot`, `requestHint`, `runPreflightProbe`). |
| `mcp/server/src/preflight.ts` | Frozen `PROBE_ORDER` + probe registry. |
| `mcp/server/src/probes/*.ts` | One file per probe. |
| `mcp/server/src/state.ts` | State load/save with corruption archiving and atomic writes. |
| `mcp/server/src/registry.ts` | Scans `paths/`, validates `path.json` + `phases.json` together. |
| `mcp/server/src/phaseEngine.ts` | Phase/spot loading, current-spot resolution, cursor advancement. |
| `mcp/server/src/personalization.ts` | `{{ key }}` substitution and option validation. |
| `mcp/server/src/ladder.ts` | Rung gating and `runAutoWrite` (rung 3). |
| `mcp/server/src/outputStyle.ts` | Gates every tool by reading `~/.claude/settings.json`. |
| `mcp/server/src/pathSafety.ts` | `containedPath` guard for rung-3 file writes. |
| `mcp/server/src/schemas/{path,phases,state}.ts` | Hand-rolled validators (no zod for these). |
| `paths/<slug>/path.json` | Path manifest (slug, title, summary, personalization options + ranges, build_command). |
| `paths/<slug>/phases.json` | Ordered phases → spots, each with `target_file`, `target_range`, `prompt`, `verification`, `rungs`, `doc_links`. |
| `paths/<slug>/phases/*.md` | Long-form phase explainer rendered alongside the first spot. |
| `paths/<slug>/rungs/<spot-id>/{hint,reference,auto}.md` | The three help rungs per spot. |
| `paths/<slug>/reference/` | Reference implementations for rung 2 / rung 3 to copy from. |
| `tests/*.test.ts` | Vitest suites — unit + harness-level integration tests. |
| `commands/start.md` | `/sui-deepbook-course:start` → delegates to the course-engine skill. |
| `agents/course-conductor.md` | Spot-loop contract (used after path selection). |

## Architectural Invariants (do not break)

1. **Output-style gate runs before any state load** in every gated tool (`selectPath`, `setPersonalization`, `nextSpot`, `verifySpot`, `requestHint`). The pattern is: probe `outputStyleOk` → return `output-style-disabled` early → only then `loadState`. Codebase calls this "L002 carry-forward". When adding new gated tools, replicate this ordering.
2. **`paths/` registry validates `path.json` AND `phases.json` together.** A path that has a valid `path.json` but malformed `phases.json` is dropped from the registry and emitted as a warning. Don't relax this — cycle 4 onward depends on phases being load-bearing.
3. **Rung gating is enforced server-side** as defense-in-depth even though the agent also enforces it. Rung 2 requires `hint_used: true`. Rung 3 requires `reference_shown: true`. Violations return a `rung-out-of-order` structured error.
4. **Rung 3 (auto-write) goes through `requestHint` MCP only.** Never add a Bash side-channel for file mutation. The server snapshots the original to `.sui-deepbook-course/snapshots/...`, replaces the file, and runs the auto-verify in one transaction.
5. **State writes are atomic.** `state.ts:saveState` writes to a `tmp` file with `wx` + `0o600`, fsyncs via `FileHandle.sync()`, then renames over the canonical path. Don't replace this with a plain `writeFile`.
6. **Corrupt state recovery is two-tier.** If `state.json` is unreadable JSON / fails schema validation, the bytes are archived under `.sui-deepbook-course/state.corrupt-<sha256-prefix>.json` (deduped via `wx` flag, mode `0o600`) and the slot is treated as absent on the next `selectPath`. If the archive write itself fails (full disk / EACCES), `selectPath` returns an error telling the user to delete `state.json` manually — do not silently swallow that case.
7. **`{{ ... }}` substitution is scoped to spot prompts only.** `personalization.ts:substitutePromptOnly` is the only function that performs it. Never call it on `target_file`, `target_range`, `verification.command`, or `verification.endpoint` — those are not user-controlled surfaces and substitution there would be a path-traversal vector.
8. **Verification spawn is injectable.** `runVerification` accepts a `spawn` stub via `VerifySpotOptions.spawn` for hermetic tests (cycle-4 H001 fix). Don't re-introduce a module-level test override.
9. **`auto_completed` is permanent** once set by a successful rung 3. It is never cleared — not on retry, not on session restart, not on path reset short of deleting `state.json`.
10. **Preflight is skipped in cycle 1.** `start` always returns `preflight: { skipped: true, reason: "cycle-1" }`. Probes only run via `runPreflightProbe` on subsequent cycles. Do not move probe execution into `start`.

## Verification Modes

`verify.ts:runVerification` supports two modes today. Anything else throws `VerificationModeUnsupportedError`:

- **`compile`** — spawn `verification.command` (defaulting to path's `build_command`) in `projectRoot`. Pass = exit 0.
- **`simulate`** — `fetch(verification.endpoint)` and compare against `verification.expected_status`.

## Preflight Probes (frozen order)

`docker-running` → `node-version` → `pnpm-available` → `sui-cli-version` → `sui-pilot-enabled` → `sandbox-repo-present` → `sandbox-manifest-reachable` → `learning-output-style-enabled`.

Only `sandbox-manifest-reachable` returns a remediation `ShellAction` (`pnpm deploy-all --quick` in `~/workspace/deepbook-sandbox/sandbox`). Real-mode remediation is gated by `docker-running`, `sui-cli-version`, and `sandbox-repo-present` passing first. `E2E_DEPLOY_STUB=1` is the **sole** entry to the deterministic test stub.

## Personalization

Path declares `personalization_options: ["poll_interval_ms", "pool_subset"]` plus `personalization_ranges`. The current path uses:

- `poll_interval_ms`: integer 1000–30000, default 3000
- `pool_subset`: enum `both` | `DEEP_SUI` | `SUI_USDC`, default `both`

Empty `setPersonalization({ values: {} })` accepts all defaults — that's a feature, not a bug.

## Sui Move Notes

This repo currently has no Move sources. The lessons it teaches involve TypeScript SDK code in a separate sandbox repo (`~/workspace/deepbook-sandbox`). When extending lessons that touch Move, follow the global `sui-pilot` doc-first workflow imported via `~/.claude/CLAUDE.md`.

## When You Edit MCP Server Code

1. Edit under `mcp/server/src/`.
2. Run `pnpm build` from `mcp/server` (the plugin runs the *built* `dist/index.js`, not the source).
3. Run `pnpm test` from the repo root — the harness suite covers cross-tool flows; unit suites cover individual modules.
4. Restart Claude Code if the plugin is already loaded; MCP servers don't hot-reload.

## When You Author a New Path

1. Create `paths/<slug>/{path.json, phases.json}` matching the existing schemas.
2. Add `phases/<phase-id>.md` explainers and `rungs/<spot-id>/{hint,reference,auto}.md`.
3. (Optional) Add `reference/` files for rung 2 to point at.
4. Run the harness lesson tests (`tests/harness.lesson.test.ts`) to confirm registry, phase loading, and personalization round-trip work.
