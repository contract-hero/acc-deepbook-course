# Sui DeepBook Course for Dummies

A beginner's guide to installing this Claude Code plugin and walking through your first interactive Sui DeepBook lesson.

---

## 1. What Is This?

This repo is a **Claude Code plugin** that turns any Claude Code session into an interactive coding tutor for advanced Sui / DeepBook developers. You don't run it as a standalone CLI — you register it as a plugin and then type a slash command like `/sui-deepbook-course:start` to begin a lesson.

Concretely, the plugin ships:

- An **MCP server** (`mcp/server/`) that exposes seven tools the LLM uses to drive the lesson — listing paths, running preflight probes, advancing through spots, verifying your code, and dispensing hints.
- A **learning path** (`paths/01-orderbook-viewer/`) — three phases of TypeScript work building a real-time DeepBook v3 orderbook viewer against a local sandbox.
- A **course-conductor agent** (`agents/course-conductor.md`) that runs the per-spot loop: prompt → wait for code → verify → escalate help if you fail.

After following this guide you will have the plugin installed, the prerequisites verified, and your first spot in the Orderbook Viewer path open and waiting for code.

---

## 2. How It All Fits Together (Architecture)

```
   ┌────────────────────────────────────┐
   │  Your Claude Code session          │
   │                                    │
   │   You type:                        │
   │     /sui-deepbook-course:start     │
   │           │                        │
   │           ▼                        │
   │   course-engine skill              │
   │           │                        │
   │           ▼                        │
   │   course-conductor agent ──────────┼──── stdio ────┐
   │   (drives the spot loop)           │               │
   └────────────────────────────────────┘               │
                                                        │
                                                        ▼
                          ┌───────────────────────────────────────┐
                          │  MCP server  (mcp/server/dist/...)    │
                          │                                       │
                          │   tools: start, selectPath,           │
                          │          runPreflightProbe,           │
                          │          setPersonalization,          │
                          │          nextSpot, verifySpot,        │
                          │          requestHint                  │
                          │                                       │
                          │   reads:  paths/<slug>/{path,phases}  │
                          │   writes: .sui-deepbook-course/       │
                          │                state.json             │
                          └─────────┬──────────────┬──────────────┘
                                    │              │
                                    ▼              ▼
                       HTTP fetch on              spawn (compile
                       localhost:9009/manifest    verification, e.g.
                       (deepbook-sandbox)         pnpm build)
```

The course-conductor agent and the MCP server speak over stdio (the plugin manifest declares `"command": "node", "args": ["mcp/server/dist/index.js"]`). The MCP server is the only component that reads or writes course state and the only component that talks to the deepbook-sandbox over HTTP. Verification commands are spawned by the MCP server, not by the agent — that boundary is enforced by design.

---

## 3. Prerequisites

Install all of these. Versions matter — preflight probes will refuse to advance if anything is missing.

- **Claude Code** with plugin support — the host this whole thing runs inside.
- **Node.js >= 18** — the MCP server is ESM and uses `fs.promises` features that landed in 18.
  ```bash
  brew install node
  ```
- **pnpm** — the only supported package manager for this repo and for the sandbox.
  ```bash
  npm install -g pnpm
  ```
- **Sui CLI** — needed by the sandbox, not the course itself, but probes check it.
  ```bash
  brew install sui
  ```
- **Docker** running — the deepbook-sandbox uses it for the local validator.
  ```bash
  brew install --cask docker
  open -a Docker
  ```
- **Git** — for cloning the sandbox repo.
- **deepbook-sandbox** cloned at `~/workspace/deepbook-sandbox`:
  ```bash
  mkdir -p ~/workspace
  git clone --recurse-submodules https://github.com/MystenLabs/deepbook-sandbox.git ~/workspace/deepbook-sandbox
  ```
- **(Optional) sui-pilot plugin** — provides bundled docs the lessons link to.
- **(Optional but recommended) learning-output-style plugin** — `learning-output-style@claude-plugins-official`. Without it, the MCP server refuses to load state and every gated tool returns `output-style-disabled`.

---

## 4. Configuration

The course needs exactly two things configured before it can run.

**4.1 Enable the learning output style plugin in `~/.claude/settings.json`:**

```json
{
  "enabledPlugins": {
    "learning-output-style@claude-plugins-official": true
  }
}
```

`enabledPlugins` must be an **object**, not an array — the probe explicitly rejects array shapes.

**4.2 Get the sandbox manifest serving on `localhost:9009`:**

```bash
cd ~/workspace/deepbook-sandbox/sandbox
pnpm install
pnpm deploy-all --quick
```

`deploy-all` boots the local Sui validator, deploys DeepBook + token + USDC packages, opens the DEEP_SUI and SUI_USDC pools, and starts a faucet HTTP server at `http://localhost:9009/manifest`. The course MCP server fetches that manifest both during preflight (`sandbox-manifest-reachable` probe) and at lesson runtime.

That's it. The course itself has no `.env` file or CLI flags — all knobs are personalization options inside the path's `path.json` (poll interval, pool subset).

---

## 5. Installation

### 5.1 Install dependencies and build the MCP server

```bash
cd /Users/alilloig/workspace/sui-mcp-course
pnpm install
cd mcp/server
pnpm install
pnpm build
```

The build produces `mcp/server/dist/index.js`, which is the binary `plugin.json` points Claude Code at.

### 5.2 Register as a Claude Code plugin

Point Claude Code at `.claude-plugin/plugin.json` in this repo. The manifest declares one MCP server (`sui-deepbook-course`), the slash command directory (`commands/`), and the skill directory (`skills/`). Claude Code wires those into your session.

Verify the plugin loaded by typing this in a fresh Claude Code session:

```
/sui-deepbook-course:start
```

If Claude Code can't find the command, the plugin isn't registered.

---

## 6. First-Time Setup / Build

The `pnpm build` step above does all the heavy lifting. Here's what it actually compiles:

1. **`mcp/server/src/index.ts` → `dist/index.js`** — the MCP entry point. When run as a script (the case under Claude Code) it spins up a `StdioServerTransport` and registers the seven tools.
2. **`mcp/server/src/probes/*.ts`** — the eight preflight probes. Each is an async function returning `{ pass, message, action? }`. Frozen probe order lives in `preflight.ts` (`PROBE_ORDER`).
3. **`mcp/server/src/tools/*.ts`** — one file per MCP tool. They share `state.ts`, `phaseEngine.ts`, `personalization.ts`, and `pathSafety.ts`.

The first time you run `/sui-deepbook-course:start`, the MCP server:

1. Calls `probeOutputStyle()` to confirm `learning-output-style@claude-plugins-official` is enabled in `~/.claude/settings.json`.
2. Scans `paths/` for valid path directories — each must contain a schema-valid `path.json` AND `phases.json`. Invalid paths are emitted as `warnings`, not paths, so a single broken path doesn't poison the registry.
3. Loads `.sui-deepbook-course/state.json` from your project root if present. Cycle 1 always reports `preflight: { skipped: true, reason: "cycle-1" }` and `state: null` — preflight probes only run on subsequent cycles.

---

## 7. Core Usage

Open Claude Code in any directory you want to use as your **project root** (the lesson's working directory — where `state.json` will live and where verification commands will run). Then:

```
/sui-deepbook-course:start
```

What happens:

1. The course-engine skill calls the `start` MCP tool with `projectRoot`.
2. Claude renders the available paths (currently one — `01-orderbook-viewer`).
3. You pick a path. Claude calls `selectPath({ projectRoot, slug })`, which writes the initial `state.json` and returns personalization prompts.
4. You answer the prompts (poll interval, pool subset). Claude calls `setPersonalization`.
5. Claude calls `nextSpot` to fetch the first spot's prompt with your personalization values substituted into `{{ poll_interval_ms }}` and `{{ pool_subset }}` placeholders.
6. You write code. Claude calls `verifySpot`. On pass, the cursor advances. On fail, Claude offers help — see the next section.

---

## 8. Day-to-Day Workflow

A realistic session looks like this:

```bash
# Start the course in the directory where you want to write code
cd ~/some-empty-project
# (open Claude Code here)

# In Claude Code:
/sui-deepbook-course:start
# → pick "Orderbook Viewer"
# → set poll_interval_ms=3000, pool_subset=both
# → Claude shows you spot p1-spot-1 and the target file/range

# You write code in src/App.tsx lines 39-58.
# Claude calls verifySpot — runs `pnpm build`.

# If it fails, Claude offers escalating help:
#   1. "Want a hint?"               → rung 1
#   2. "Want to see the reference?" → rung 2 (only after rung 1)
#   3. "Want me to write it for you?" → rung 3 (only after rung 2)

# On pass, the cursor advances to p2-spot-1.
# Repeat until phases.json is exhausted — Claude congratulates you.
```

Your progress is saved in `.sui-deepbook-course/state.json` after every passing spot, every personalization update, and every rung use. Closing the Claude Code session and re-running `/sui-deepbook-course:start` resumes from the same cursor.

> **Note:** The help ladder is gated. Rung 2 errors with `rung-out-of-order` if `hint_used` is false; rung 3 errors if `reference_shown` is false. The agent enforces this client-side; the MCP server enforces it server-side.

---

## 9. The Lesson Workspace (F-005)

You don't edit code in your project root or in the deepbook-sandbox checkout. The course provisions a **workspace** the first time you call `selectPath`:

```
~/.sui-deepbook-course/workspaces/<path-slug>/
├── package.json, vite.config.ts, tsconfig*, index.html  ← seeded from paths/<slug>/hosts/...
├── src/main.tsx                                          ← seeded from the host
├── src/App.tsx                                           ← seeded from paths/<slug>/starters/p1-spot-1/...
├── node_modules/                                         ← created by `pnpm install`
└── .course-state.json                                    ← workspace metadata (schema, host_signature)
```

When you ask `nextSpot`, the response carries `target_file_absolute` pointing at `~/.sui-deepbook-course/workspaces/<slug>/src/App.tsx`. Open it in your editor; that's the file to edit. `verifySpot` runs the path's `verification.command` (e.g. `pnpm build`) **inside the workspace** — not in your project root.

Workspaces are **idempotent**: re-running `selectPath` on the same slug reuses the existing workspace as long as the path's `hosts/` content is unchanged (the course fingerprints it via sha256 into `host_signature`). If the host changes, the existing workspace is archived to `<workspace>.archive-<ts>/` and a fresh one is built.

To wipe a workspace and start over, delete `~/.sui-deepbook-course/workspaces/<slug>/` (or call the `resetWorkspace` MCP tool when it's exposed in PR 2).

**Per-spot exercise styles**: each spot can offer two styles — `fill-in-blank` (the starter file with TODO regions you fill in) and `prompted-agentic` (a sequence of pre-written prompts you paste into Claude; PR 2 deliverable). The `selectStyle` MCP tool persists your choice into `state.selected_style_per_spot[spot_id]`. PR 1 only honors `fill-in-blank`; choosing `prompted-agentic` returns `style-not-yet-supported`.

---

## 10. The Help Ladder (Rungs)

Each spot has three rungs of escalating help, stored as Markdown under `paths/<slug>/rungs/<spot-id>/`:

- **`hint.md`** (rung 1) — a paragraph nudging you toward the right approach. Sets `hint_used: true`.
- **`reference.md`** (rung 2) — the actual reference snippet. Sets `reference_shown: true`. Requires rung 1 first.
- **`auto.md`** (rung 3) — the auto-write payload. The MCP server's `runAutoWrite` snapshots the current target file, replaces the contents, and immediately re-runs verification. Sets `auto_completed: true` (permanent, never cleared) and returns an `autoVerifyResult` block.

Rung 3 is **only** invoked through the `requestHint` MCP tool. The agent is explicitly forbidden from running a Bash command or shell to perform the auto-write — file mutation belongs to the server so the snapshot/verify dance stays atomic.

---

## 11. Rebuilding / Destructive Operations

There are no built-in reset commands. If you want to start a path over, manually delete the state file:

```bash
rm -rf .sui-deepbook-course/
```

**What gets destroyed:**

| What | Destroyed? |
|---|---|
| Your code in the project root | Never (the course never deletes your source) |
| `.sui-deepbook-course/state.json` | Yes — cursor, personalization, ladder progress |
| Auto-write snapshots (`.sui-deepbook-course/snapshots/...`) | Yes |
| Course path content (`paths/`) | Never |
| Sandbox state (`~/workspace/deepbook-sandbox`) | Never |

If `state.json` is corrupt (invalid JSON, missing `schema_version`, or schema-validation failure), the server archives it under `.sui-deepbook-course/state.corrupt-<hash>.json` (mode `0o600`, deduped by content hash) and treats the slot as absent on the next `selectPath`. If the archive write itself also fails, the server refuses to proceed and asks you to delete `state.json` manually.

**Always commit your code before invoking rung 3** — auto-write replaces your file contents in place. The server snapshots the original under `.sui-deepbook-course/snapshots/...`, but the canonical recovery path is your own VCS.

---

## 12. Troubleshooting

**`/sui-deepbook-course:start` says no paths are installed.** — `paths/01-orderbook-viewer/path.json` or `phases.json` is missing or schema-invalid. Check the `warnings` array in the tool output for the specific reason (`missing-path-json`, `malformed-phases-json`, `invalid-path-json`, etc.).

**Every tool returns `output-style-disabled`.** — `learning-output-style@claude-plugins-official` is not `true` in `~/.claude/settings.json` under `enabledPlugins`. The probe also rejects `enabledPlugins: []` (array) — it must be an object.

**`sandbox-manifest-reachable` probe fails.** — The sandbox isn't running. The probe's `action.command` is `pnpm deploy-all --quick` in `~/workspace/deepbook-sandbox/sandbox`. Run it manually, or call `runPreflightProbe({ probeId: "sandbox-manifest-reachable", remediate: true })` to let the server run it for you (real-mode requires `docker-running`, `sui-cli-version`, and `sandbox-repo-present` probes to pass first).

**`verifySpot` returns `verification mode '...' not yet supported`.** — A spot's `verification.mode` is set to a value the verifier doesn't implement. Currently supported modes are `compile` (spawns a shell command and checks exit 0) and `simulate` (HTTP GET + `expected_status` check). Anything else throws `VerificationModeUnsupportedError`.

**`selectPath` says "State corrupt: ... Archive write also failed".** — The state file is unreadable AND the archive directory is unwritable (full disk, EACCES). Delete `.sui-deepbook-course/state.json` manually and retry.

**Cycle 1 always reports `preflight: { skipped: true }`.** — That's by design. Preflight probes only run on subsequent cycles via `runPreflightProbe`, not inside `start`.

---

## Appendix A: All MCP Tools

| Tool | Purpose |
|---|---|
| `start` | Initialize session — returns paths, output-style status, current state, and warnings. |
| `runPreflightProbe` | Run one probe by id. With `remediate: true`, executes the probe's shell action (used for `sandbox-manifest-reachable`). |
| `selectPath` | Pick a path slug. Validates, writes initial `state.json`, returns personalization prompts. |
| `setPersonalization` | Apply personalization values. Empty `{}` accepts all defaults. |
| `nextSpot` | Fetch the current spot — returns prompt (with `{{ }}` substituted), target file/range, doc links, ladder state. |
| `verifySpot` | Run the spot's verification. On pass, advances the cursor. On fail, leaves it untouched. |
| `requestHint` | Get help — `rung: 1` (hint), `rung: 2` (reference), `rung: 3` (auto-write + auto-verify). |

All tools require `projectRoot` (absolute path) except `runPreflightProbe`.

---

## Appendix B: Preflight Probes

The eight probes, in `PROBE_ORDER`:

| Probe id | Checks |
|---|---|
| `docker-running` | `docker info` exits 0. |
| `node-version` | `process.version` major >= 18. |
| `pnpm-available` | `pnpm --version` exits 0. |
| `sui-cli-version` | `sui --version` exits 0 and parses. |
| `sui-pilot-enabled` | `sui-pilot` plugin enabled in `~/.claude/settings.json`. |
| `sandbox-repo-present` | `~/workspace/deepbook-sandbox` exists and is a directory. |
| `sandbox-manifest-reachable` | HTTP GET `http://localhost:9009/manifest` returns 200 within 5s. |
| `learning-output-style-enabled` | `learning-output-style@claude-plugins-official: true` in settings. |

`runPreflightProbe` with `remediate: true` only has an effect for `sandbox-manifest-reachable` — that's the only probe that returns a `ShellAction`. Real-mode remediation is gated by probes #1, #4, #6 passing first; setting `E2E_DEPLOY_STUB=1` in the environment bypasses the spawn entirely with a deterministic stub (test-only).

---

## Appendix C: Configuration Reference

### `paths/<slug>/path.json`

| Field | Required | Description |
|---|---|---|
| `slug` | Yes | URL-safe path id; must match the directory name. |
| `title` | Yes | Display name shown by `start`. |
| `summary` | Yes | One-line description. |
| `personalization_options` | Yes | Array of option names this path accepts. |
| `personalization_ranges` | No | Per-option `{ min, max, default }` (integer) or `{ values, default }` (enum). |
| `build_command` | Yes | Default verification command for compile-mode spots. |

### `paths/<slug>/phases.json`

A `phases` array. Each phase has `id`, `title`, `explainer_md`, and a `spots` array. Each spot has `id`, `title`, `target_file`, `target_range`, `prompt` (with `{{ key }}` placeholders), `verification` (mode-specific), `rungs` (paths to `hint_md`, `reference_md`, `auto_write_md`), and `doc_links`.

### `verification` modes

| Mode | Fields | Behavior |
|---|---|---|
| `compile` | `command` | Spawn the command in `projectRoot`. Pass = exit 0. |
| `simulate` | `endpoint`, `expected_status` | HTTP GET. Pass = response.status matches. |

### `state.json` schema (version 2 — F-005 bumped from 1)

```json
{
  "schema_version": 1,
  "selected_path": "01-orderbook-viewer",
  "personalization": { "poll_interval_ms": 3000, "pool_subset": "both" },
  "cursor": { "phase_id": "p1-bootstrap", "spot_id": "p1-spot-1" },
  "ladder": {
    "p1-spot-1": {
      "hint_used": false,
      "reference_shown": false,
      "auto_completed": false,
      "auto_write_attempted": false
    }
  },
  "history": []
}
```

Stored under `.sui-deepbook-course/state.json` in `projectRoot`. Mode `0o600`. Writes are atomic — `tmp` file with `wx` flag, `fsync` via the `FileHandle`, then `rename` over the canonical path.

### Personalization knobs (Orderbook Viewer)

| Key | Type | Range / Values | Default |
|---|---|---|---|
| `poll_interval_ms` | integer | 1000–30000 | 3000 |
| `pool_subset` | enum | `both`, `DEEP_SUI`, `SUI_USDC` | `both` |

---

## Appendix D: How It Boots (Under the Hood)

1. Claude Code reads `.claude-plugin/plugin.json` and registers the `sui-deepbook-course` MCP server with `command: node` and `args: ["mcp/server/dist/index.js"]`.
2. When the user types `/sui-deepbook-course:start`, Claude Code resolves it via `commands/start.md` to the `course-engine` skill (`skills/course-engine/SKILL.md`).
3. The skill instructs the LLM to call the `start` MCP tool. The tool spawns the MCP server (if not already running) over stdio.
4. `mcp/server/src/index.ts` checks `import.meta.url` against `process.argv[1]`; when launched as a script it builds an `McpServer`, calls `registerTools(server)`, and connects a `StdioServerTransport`.
5. Each tool call routes to `tools/<name>.ts`, which loads/saves state via `state.ts`, reads path content via `phaseEngine.ts`, and gates output behind `outputStyle.ts` and `pathSafety.ts`.
6. Verification commands are spawned by `verify.ts` using `node:child_process`. The harness's tests inject a `spawn` stub via `VerifySpotOptions.spawn` to keep test runs hermetic.

---

## Appendix E: Glossary

- **Path** — A complete lesson series with a slug, manifest (`path.json`), and phase plan (`phases.json`). One per directory under `paths/`.
- **Phase** — A grouping of spots inside a path. The current path has three: bootstrap, retry, polling.
- **Spot** — One discrete coding task targeting a specific file and line range. The atomic unit of progress.
- **Rung** — One level of help for a spot: 1 (hint), 2 (reference), 3 (auto-write). Rungs are gated and tracked in `state.ladder[spot_id]`.
- **Ladder** — The per-spot help-state record (`hint_used`, `reference_shown`, `auto_completed`, `auto_write_attempted`).
- **Cursor** — The current `(phase_id, spot_id)` pair in `state.json`. Advances on a passing `verifySpot`.
- **Personalization** — Per-path knobs (e.g. `poll_interval_ms`) substituted into spot prompts via `{{ key }}` placeholders.
- **Preflight probe** — A diagnostic check (Docker, Node, pnpm, sandbox, output style) that gates the lesson environment.
- **Manifest** — The deepbook-sandbox's `/api/faucet/manifest` JSON describing on-chain object ids — packages, pools, coin types — that the SDK needs to make queries.
- **DeepBook v3** — The central limit order book protocol on Sui that the lessons teach you to integrate.

---

## Appendix F: Important Files

| File | Description |
|---|---|
| `.claude-plugin/plugin.json` | Claude Code plugin manifest (MCP server, commands, skills). |
| `commands/start.md` | The `/sui-deepbook-course:start` slash command — delegates to the skill. |
| `skills/course-engine/SKILL.md` | Skill that calls `start` and renders results. |
| `agents/course-conductor.md` | Agent contract for the per-spot loop (used after path selection). |
| `mcp/server/src/index.ts` | MCP server entry point + tool registration. |
| `mcp/server/src/preflight.ts` | Probe registry and `PROBE_ORDER`. |
| `mcp/server/src/state.ts` | State load/save with corruption archiving and atomic writes. |
| `mcp/server/src/registry.ts` | `paths/` directory scanner — validates each path's `path.json` and `phases.json`. |
| `mcp/server/src/phaseEngine.ts` | Phase/spot loading, current-spot resolution, cursor advancement. |
| `mcp/server/src/personalization.ts` | `{{ key }}` substitution and option validation. |
| `mcp/server/src/ladder.ts` | Rung gating and `runAutoWrite`. |
| `mcp/server/src/outputStyle.ts` | Reads `~/.claude/settings.json` to gate every tool. |
| `mcp/server/src/pathSafety.ts` | `containedPath` helper guarding rung 3 file writes against path traversal. |
| `paths/01-orderbook-viewer/path.json` | Path manifest for the Orderbook Viewer course. |
| `paths/01-orderbook-viewer/phases.json` | Three-phase plan with target files, prompts, and verification specs. |
| `paths/01-orderbook-viewer/reference/App.tsx` | The complete reference implementation (used by rung 2 / rung 3). |
| `tests/` | Vitest suites for every module — run with `pnpm test`. |
| `create-mastra-architecture-report.md` | Historical design document; the *implemented* shape diverges from it. |

---

## Appendix G: A Note on `CLAUDE.md`

The `CLAUDE.md` at the repo root describes a planned `packages/create-deepbook-course` + `packages/deepbook-course-cli` monorepo following the `create-mastra` pattern. **That structure was not built.** The actual implementation is the Claude Code plugin you see here — a single MCP server plus path content. Treat `CLAUDE.md` and `create-mastra-architecture-report.md` as design notes, not as ground truth for the current code.
