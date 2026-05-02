# Sui DeepBook Course

A Claude Code plugin that turns "go learn DeepBook" into an interactive, hint-laddered build session. The student owns the 5–10 load-bearing lines per phase. Claude is the patient TA, not the implementer.

First path shipping: **`01-orderbook-viewer`** — rebuild a real-time DeepBook v3 order book viewer (Vite + React + TypeScript) against the local DeepBook sandbox.

---

## Learning experience

You open Claude Code in a clean workspace and type:

```
/sui-deepbook-course:start
```

From there, the flow is:

1. **Output-style + preflight check.** The plugin advises you to enable `learning-output-style@claude-plugins-official` (so Claude doesn't auto-implement), then probes that Node, pnpm, the Sui CLI, Docker, and the DeepBook sandbox at `localhost:9009/manifest` are all reachable. Failures surface a one-line remediation.
2. **Pick a path.** Today only `Orderbook Viewer` is registered. New paths drop in as content (no engine changes — see *Tech & build* below).
3. **Personalize.** You set bounded knobs (e.g. `poll_interval_ms` 1000–30000 ms, `pool_subset` = `DEEP_SUI` / `SUI_USDC` / `both`). Defaults work; the values are substituted into prompts and reference code.
4. **Walk the phases.** Each path is a sequence of *phases* (e.g. *Manifest → SDK Config*, *Resilient gRPC with Retry*, *Polling Loop*). Each phase contains one or more *spots* — a numbered range of lines in a real source file (`src/App.tsx:39-58`, etc.) that you, the student, fill in.
5. **The spot loop.** For every spot, the `course-conductor` agent:
   - Calls `nextSpot` and shows you the prompt, target file, and doc links.
   - Waits for you to write code.
   - Calls `verifySpot` — either `pnpm build` (compile mode) or a sandbox HTTP probe (simulate mode).
6. **The help ladder.** When verification fails, help escalates only on request and only in order:

   | Rung | Name        | What happens                                                              |
   |------|-------------|---------------------------------------------------------------------------|
   | 1    | Hint        | A short nudge — *what* to look up, not *what* to type.                    |
   | 2    | Reference   | The reference snippet for the spot, shown inline.                         |
   | 3    | Auto-write  | The MCP server writes the reference into your file (after snapshotting it) and re-runs verification. |

   Rungs are **strictly gated**: rung 2 requires rung 1 used, rung 3 requires rung 2 used. The auto-write is committed by the MCP tool itself — never via a Bash side channel — so the snapshot/restore contract is airtight.

7. **Advance.** On pass, the cursor moves to the next spot; when the path is exhausted, the conductor congratulates you. State persists in `.sui-deepbook-course/` so you can quit and resume.

---

## Tech & build

The plugin is a small monorepo with three coordinating surfaces:

```
.claude-plugin/plugin.json   # Claude Code manifest
commands/start.md            # /sui-deepbook-course:start → loads the skill
skills/course-engine/        # Skill body → calls MCP tools, then hands off to…
agents/course-conductor.md   # …the conductor agent (drives the spot loop)
mcp/server/                  # TypeScript MCP server (stdio, 7 tools)
paths/<slug>/                # Pure content: phases.json, phase explainers, rungs
scripts/e2e/                 # End-to-end harness (in-process MCP client)
tests/                       # vitest suites: unit + harness + cycle scenarios
```

### How the pieces talk

```
slash command  →  skill  →  conductor agent  →  MCP tools  →  state + content
   (entry)      (loads)       (judgement)     (7 tools)      (paths/, .sui-deepbook-course/)
```

There is **no programmatic dispatch**. Slash command, skill, and agent are markdown that instruct Claude. The runtime contract lives in the MCP tools.

### MCP tools (`mcp/server/src/tools/`)

| Tool                  | Purpose                                                                     |
|-----------------------|-----------------------------------------------------------------------------|
| `start`               | Lists paths, reports output-style status and warnings.                      |
| `runPreflightProbe`   | Runs one probe (`docker`, `pnpm`, `sui-cli`, `sandbox-manifest-reachable`, …) and optionally remediates. |
| `selectPath`          | Activates a path, returns its personalization schema.                       |
| `setPersonalization`  | Writes user values into state (validated against ranges in `path.json`).    |
| `nextSpot`            | Returns the current spot view with template variables substituted.          |
| `verifySpot`          | Runs the spot's verification (`pnpm build` or HTTP probe). Advances on pass.|
| `requestHint`         | Returns rung 1/2 content, or performs the rung-3 auto-write + verify.       |

### Path content shape

A path is a directory — engine code never changes when adding one:

```
paths/01-orderbook-viewer/
  path.json          # slug, title, personalization options + ranges
  description.md     # learner-facing intro
  phases.json        # ordered phases → spots (target_file, target_range, verification, rungs)
  phases/p1-bootstrap.md    # per-phase explainer
  rungs/p1-spot-1/{hint,reference,auto}.md
  reference/App.tsx  # full reference implementation
```

Adding `02-fee-rebate-swap` is a content PR: drop a new directory, the registry picks it up.

### Build & run

```bash
pnpm install
cd mcp/server && pnpm install && pnpm build
```

Register the plugin by pointing Claude Code at `.claude-plugin/plugin.json`, then in any session:

```
/sui-deepbook-course:start
```

To run the MCP server standalone (for protocol debugging):

```bash
cd mcp/server && pnpm start
```

### Tests

```bash
pnpm test
```

The suite covers schema validation, the phase engine, the help ladder's gating contract, the preflight probes, the auto-write snapshot/restore contract, and an in-process MCP harness that walks a full lesson end-to-end (`tests/harness.lesson.test.ts`).

### How it was built

The repo was bootstrapped via [Code Forge](https://github.com/) — a multi-agent build pipeline — across six TDD cycles plus a Phase F polish pass. The cycle artifacts (specs, plans, evaluator notes) live under `.forge/` and are kept in-tree as the audit trail for protocol decisions (e.g. why the help ladder is strictly ordered, why rung 3 must not use Bash).
