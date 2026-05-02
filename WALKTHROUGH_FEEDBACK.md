# Course Walkthrough Feedback

Running log of issues found during the first end-to-end course walkthrough. Will be consolidated into a single PR once the walkthrough is complete.

Status legend: `OPEN` = captured, not started · `PLANNED` = approach decided · `DONE` = fixed in PR

---

## F-001 — Course content must be distributed with the plugin, not discovered in the user's cwd · OPEN

**Symptom**: Had to `cd` into the `sui-mcp-course` repo before `/sui-deepbook-course:start` would find the `01-orderbook-viewer` path. From any other directory, the course can't see the lessons.

**Why this is wrong**: The plugin distribution should be self-contained. A learner who installs the plugin should be able to run the course from any project directory — the path *content* (phases, rungs, references, descriptions) belongs to the plugin; only the *learner's working state and code* belong in their cwd.

**Current behavior** (`mcp/server/src/tools/start.ts:21`):
```ts
const pathsRoot = path.join(projectRoot, 'paths');
const registry = await scanRegistry(pathsRoot);
```
`projectRoot` is the user's cwd, so paths are only found if the user is sitting in this repo.

**Desired behavior**:
- Path content (`paths/<slug>/path.json`, `phases.json`, `phases/`, `rungs/`, `reference/`, `description.md`) is read from `${CLAUDE_PLUGIN_ROOT}/paths/`.
- State (`.sui-deepbook-course/state.json`) continues to live in the user's `projectRoot`.
- Verification commands (`pnpm build`, etc.) continue to run in the user's `projectRoot`.

**Likely affected**:
- `mcp/server/src/tools/start.ts` — read paths root from a plugin-rooted constant, not `projectRoot`.
- `mcp/server/src/tools/selectPath.ts` — same change for `path.join(projectRoot, 'paths', slug, 'path.json')`.
- `mcp/server/src/phaseEngine.ts` — same change for `loadPhases`.
- `mcp/server/src/tools/requestHint.ts` — rung markdown reads.
- `mcp/server/src/tools/nextSpot.ts` — phase explainer reads.
- `mcp/server/src/registry.ts` — `scanRegistry` callers.
- The MCP server entry needs a way to learn the plugin root. The plugin manifest spawns it with `${CLAUDE_PLUGIN_ROOT}/mcp/server/dist/index.js` — so `process.argv[1]` itself contains the install root. Walk up from `argv[1]` (`<root>/mcp/server/dist/index.js` → `<root>`) and use that as the paths root.
- Tests under `tests/` that synthesize fixture path roots — keep `paths_root` injectable so harness tests can still point at temp dirs.

**Open questions**:
- Should we still allow a project-local `paths/` to take precedence (so a power user can prototype a new path in their own repo)? Probably yes — fall back to the plugin-shipped paths if no project-local `paths/` directory exists.

---

## F-002 — After `selectPath`, the agent should explain what the path is about before personalization · OPEN

**Symptom**: Selecting a path immediately drops into personalization prompts (`poll_interval_ms`, `pool_subset`) without the learner having any sense of what they're about to build, why, or how long it will take.

**Why this matters**: The path already has a `description.md` (e.g. `paths/01-orderbook-viewer/description.md`) explicitly written for this — it covers what you'll build, prerequisites, what you'll learn, and duration. That content is currently dead — nothing reads it.

**Current behavior**:
- `selectPath` MCP tool returns `{ ok: true, personalizationPrompts: [...] }` and nothing else.
- The course-engine skill / course-conductor agent jump straight into prompting for personalization.

**Desired behavior**:
- After `selectPath` succeeds, the agent renders the path's description (the `description.md` body) so the learner knows what they're signing up for.
- Then proceeds to personalization prompts.

**Two ways to implement**:
1. **Server-side (preferred)**: `selectPath` returns the description content alongside the prompts. The skill renders it before personalization.
2. **Client-side**: The agent reads `description.md` itself after `selectPath` returns. Simpler, but requires the agent to know where the file lives — couples agent to repo layout.

Option 1 is cleaner and keeps the plugin-root knowledge inside the MCP server.

**Likely affected**:
- `mcp/server/src/tools/selectPath.ts` — load `description.md` and return its content as `description: string`.
- `skills/course-engine/SKILL.md` — extend the rendering instructions to include description after selectPath.
- `agents/course-conductor.md` — minor update if the conductor narrates the description.
- Tests in `tests/selectPath.test.ts` — assert description is returned.

---

## F-003 — Spot prompts must include the absolute path of the file to edit · OPEN

**Symptom**: When `nextSpot` returns a spot, the prompt says things like *"Lines 39–58 of `src/App.tsx` are the target"* without telling the learner **where** `src/App.tsx` actually lives. Since edits happen inside the deepbook-sandbox checkout (not the user's `projectRoot`), `src/App.tsx` is ambiguous — the learner has to guess or hunt for the file.

**Why this matters**: The whole point of "the LLM is a TA, you write the code" is that the learner moves between Claude's narration and a real editor. Friction in finding the file kills that loop. A clickable / copy-pasteable absolute path is the smallest possible affordance.

**Current behavior** (`mcp/server/src/schemas/phases.ts` and `tools/nextSpot.ts`): each spot has `target_file` (e.g. `"src/App.tsx"`) and `target_range` (e.g. `"39-58"`). These are passed through to the agent as-is, with no resolution against the workspace root.

**Desired behavior**:
- The MCP server resolves `target_file` against the lesson workspace root (the path inside the deepbook-sandbox checkout where this lesson's app lives — e.g. `~/workspace/deepbook-sandbox/examples/orderbook-viewer/src/App.tsx`).
- `nextSpot` returns both the relative path (for display in prose) and the resolved absolute path (for "click to open" / copy-paste).
- The prompt template includes the absolute path explicitly: *"Open `~/workspace/deepbook-sandbox/examples/orderbook-viewer/src/App.tsx` and edit lines 39–58."*

**Open questions**:
- Where does the workspace root come from? Two options:
  1. Declared per-path in `path.json` (e.g. `"workspace_root": "examples/orderbook-viewer"` relative to a known `~/workspace/deepbook-sandbox/`).
  2. Probed at runtime — the same probe that already checks `sandbox-repo-present` could expose the resolved path to other tools.
- The reference implementation in `paths/01-orderbook-viewer/reference/App.tsx` is currently the *only* App.tsx in the repo. There's no lesson workspace yet; the design expects the learner to copy/scaffold one inside the sandbox. That scaffolding needs to be defined too — likely a new `bootstrap` step or a starter template under the path that gets `degit`-ed into the sandbox examples dir on first start.

**Likely affected**:
- `mcp/server/src/schemas/path.ts` — add `workspace_root` field.
- `mcp/server/src/schemas/phases.ts` — `target_file` semantics now mean "relative to workspace_root".
- `mcp/server/src/tools/nextSpot.ts` — return `target_file_absolute`.
- `mcp/server/src/personalization.ts` — expose absolute path as a substitution variable so prompts can reference it inline.
- The `01-orderbook-viewer` path content — declare its workspace root.
- New scaffolding step (or document the manual copy) so the learner has a real `App.tsx` to edit.

---

## F-004 — (Bonus) Optional tmux split-pane open with the user's editor · OPEN

**Symptom**: Even with an absolute path printed (F-003), the learner still has to switch context — alt-tab to their editor, paste the path, hit enter. Most-friction-removed UX would be: the file just opens, ready to edit, next to the Claude pane.

**Desired behavior** (opt-in only):
- A user-level setting (e.g. `~/.claude/sui-deepbook-course.local.md` or a `setPersonalization` knob) that says "I'm using tmux + nvim/vscode/etc., open spots for me automatically".
- When `nextSpot` advances and that setting is on, the course either:
  1. Returns an `openCommand` field (e.g. `tmux split-window -h -p 50 'nvim +39 ~/workspace/deepbook-sandbox/.../App.tsx'`) and the conductor agent runs it via Bash, OR
  2. Exposes a new MCP tool `openSpotInEditor` that does it server-side.
- Detection: `$TMUX` set → tmux mode available. `$EDITOR` set → know which editor. Both must be present or the feature no-ops silently.

**Why this is bonus, not blocker**: Niche — only useful for tmux users. The absolute-path fix in F-003 already gets ~80% of the value. Worth implementing only if F-001/F-002/F-003 land cleanly first.

**Likely affected**:
- New plugin-settings file under `.claude/sui-deepbook-course.local.md` (see the `plugin-dev:plugin-settings` pattern).
- `mcp/server/src/tools/nextSpot.ts` (or new `openSpotInEditor.ts`) — emit/run the tmux command.
- `agents/course-conductor.md` — opt-in narration of "opening file in pane 2…".
- Defensive: fall back gracefully when `$TMUX` is unset or `$EDITOR` is missing — don't error, just skip.

**Open questions**:
- Should the auto-open happen on every `nextSpot`, or only on the first one per phase? Probably first per phase, since pressing nextSpot inside a phase should keep the same file open.
- Editors with non-`+lineno` syntax (vscode uses `code -g file:line`) — the open-command generator needs editor-specific templates. Start with vim/nvim/code and grow from there.

---

## F-005 — Lesson workspace doesn't exist; need a temp-workspace + symlink design with two exercise styles · IMPLEMENTED (PR 1)

**Plan**: [`/Users/alilloig/.claude/plans/flickering-weaving-kite.md`](/Users/alilloig/.claude/plans/flickering-weaving-kite.md) (approved via ExitPlanMode 2026-05-02). Decisions: course-managed workspace dir at `~/.sui-deepbook-course/workspaces/<slug>/`, per-spot style picker, PR 1 ships Style A end-to-end + Style B scaffolded, PR 2 lights up Style B (bootstrap doc shipped: [`PR2_BOOTSTRAP.md`](./PR2_BOOTSTRAP.md)).

**PR 1 delivered** (this branch — `feat/f005-workspace-style-a`):
- `mcp/server/src/workspace.ts` (NEW) — workspace lifecycle with atomic-write metadata, host-signature fingerprinting, idempotent reuse, archive-and-recreate on host change
- `mcp/server/src/schemas/workspace.ts` (NEW) — `WorkspaceMeta` schema
- `mcp/server/src/tools/selectStyle.ts` (NEW) — per-spot exercise-style picker (PR 1 honors `fill-in-blank` only)
- Schema updates: `path.ts` adds optional `workspace` block; `phases.ts` adds optional `styles` block; `state.ts` bumps to v2 with `workspace_path` and `selected_style_per_spot`
- Tool updates: `selectPath` provisions workspace; `nextSpot` returns `target_file_absolute`; `verifySpot` spawns in workspace; `requestHint`/`ladder.runAutoWrite` route through workspace; `index.ts` registers the 8th tool
- Path content: `paths/01-orderbook-viewer/hosts/orderbook-viewer/` (Vite host), `starters/p1-spot-1/App.tsx` (with TODO regions and throw-stubs for spots 2/3), `path.json` workspace block, `phases.json` per-spot styles, empty `prompts/` placeholder
- Tests: 24 new (workspace.test.ts + selectStyle.test.ts) + updates to existing harness/lesson/state tests for v2 schema and 8-tool count. 439/440 passing (T-157 is Docker-gated env-dep)
- Docs: this entry, `PR2_BOOTSTRAP.md`, `CLAUDE.md` invariants 11+12, `SUI_DEEPBOOK_COURSE_FOR_DUMMIES.md` section 9

Original symptom + design context preserved below for reference:


**Symptom** (confirmed by an agent following the course): The course expects to verify edits to `src/App.tsx` lines 39–58 with `pnpm build`, but no such file exists anywhere a learner can plausibly edit it. Specifically:
- `paths/01-orderbook-viewer/` ships only a *finished* `reference/App.tsx` (219 lines, standalone) — no starter with TODO blanks.
- The user's `projectRoot` (the course repo) has no `src/App.tsx` and no `pnpm build` script.
- The deepbook-sandbox checkout has no orderbook-viewer subproject. `~/workspace/deepbook-sandbox/sandbox/dashboard/src/App.tsx` exists but its lines 39–58 are unrelated nav-link rendering.

So `verifySpot` cannot pass on the very first spot. The course is structurally incomplete.

This is the same gap F-003 hinted at, escalated to BLOCKING — every path is broken until we define where the learner edits.

**User's design vision** (verbatim rant captured for codex/claudex refinement):

> The paths should be meant to work with a temporary workspace folder, where all the file editing should be happening. This folder can live inside the user's local clone of deepbook-sandbox, ideally as worktrees, but not as a requirement due to the different possible permission modes users might be running. On that folder, only the files meant to be edited should live. The actual file in the sandbox will be symlinked to the file on this workspace when it's created by the learning path.
>
> Finally the tricky part, how this file should look. I want to explore two ways, if possible both present at the same time in the course so I can compare both:
> 1. **Fill-in-the-blank**: a version of the file missing a few lines (what I believe the path is doing right now, just that it's looking for the whole working version of the file in the sample dapps).
> 2. **Pre-made prompts**: a series of prompts prepared to be run by the student in their own session, leading Claude to implement that file in the most accurate way, and leveraging the enforced learning output style for the user to complete the pieces of code that the live session finds relevant — that perhaps could as well be recommended in the pre-made prompts. Leading to an experience of agentic coding, but mixed with previously defined fill-in-the-blank code exercises that help the student truly understand what's going on.

**Distilled requirements** (my read; codex pass will sharpen):
1. **Workspace location**: A temp directory (e.g. `~/.sui-deepbook-course/workspaces/<path-slug>/`) per path, owned by the course, not by the user's project. Falls back to a path inside `~/workspace/deepbook-sandbox/` (worktree if available) when permissions allow.
2. **Workspace contents**: Only files the learner edits — not a full app, not duplicate sandbox state. Everything else stays in the sandbox.
3. **Symlink bridge**: For each editable file in the workspace, create a symlink at the sandbox-side location pointing into the workspace, so `pnpm build` in the sandbox sees the learner's edits.
4. **Two exercise styles, both shipped on the same path** (so the user can A/B them):
   - **Style A (fill-in-blank)**: starter file with explicit TODO regions where the learner types the load-bearing 5–10 lines. Verification: `pnpm build` (or path-defined). Today's design, just made functional.
   - **Style B (pre-prompted agentic)**: a sequence of prompts the learner pastes into their own Claude session. Each prompt is crafted so Claude builds the file under the learning-output-style constraint — Claude proposes structure, but flags the load-bearing pieces for the learner to fill. The course supplies the prompts; learning-output-style enforces the "learner fills the blanks" contract; the result is agentic coding fused with deliberate practice.
5. **Both styles must coexist on a single path** — same lesson, two routes, comparable outcomes.

**Likely affected** (rough; codex pass will refine):
- New `mcp/server/src/workspace.ts` — workspace creation, symlink linking/unlinking, teardown.
- `mcp/server/src/tools/selectPath.ts` — provision the workspace on path selection (idempotent).
- `paths/<slug>/` schema — declare workspace files, symlink targets, optional sandbox worktree config, and per-spot exercise-style branches (`style: "fill-in-blank" | "prompted-agentic"`).
- `paths/01-orderbook-viewer/` content — produce both a fill-in-blank `App.tsx.starter` and a `prompts/` directory of agentic prompt files.
- `mcp/server/src/tools/nextSpot.ts` — return the workspace-resolved absolute path (resolves F-003 too) and which exercise style the spot uses.
- New MCP tool surface for "give me the next prompt for the agentic-style spot" (so the conductor agent can hand the prompt to the learner instead of executing it).
- Verification semantics — `compile` mode runs in the sandbox, where the symlinks land. New `prompted-agentic` mode where pass = "the learner-completed file passes the same compile check."

**Status**: Going to claudex now (`/claudex`) to refine the rant into a planning prompt, then we'll plan the implementation properly before touching code. This entry will get a `PLANNED →` link to the plan once that exists.

---

<!-- Append new entries below as the walkthrough continues. -->
