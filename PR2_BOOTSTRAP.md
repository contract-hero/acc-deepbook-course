# PR 2 Bootstrap — Light Up Style B (Prompted-Agentic)

This document is the handoff between PR 1 (which shipped the lesson workspace, the per-spot style picker, and Style A end-to-end) and the follow-up PR 2 (which lights up Style B). Read it end-to-end before starting PR 2.

## Goal

Implement the **prompted-agentic** exercise style on top of the workspace, schema, and tool surfaces PR 1 already delivered. After PR 2, every spot in `paths/01-orderbook-viewer/` should be completable via either:

- **Style A — fill-in-blank** (already working): the learner edits a starter file with TODO regions, and `verifySpot` runs `pnpm build` in the workspace.
- **Style B — prompted-agentic** (PR 2's deliverable): the learner pastes a sequence of pre-written prompts into their own Claude session. Each prompt steers Claude to build the file under the learning-output-style constraint — Claude proposes structure, the learner fills the load-bearing pieces. The same `pnpm build` verification gate eventually closes the loop.

## What PR 1 already delivered

- **Workspace lifecycle** — `prepareWorkspace` / `resetWorkspace` / `loadWorkspaceMeta` in `mcp/server/src/workspace.ts`. Workspaces live under `~/.sui-deepbook-course/workspaces/<slug>/`. Idempotent reuse + host-signature-based invalidation.
- **Schema reservations** for Style B:
  - `phases.json` per spot: `styles["prompted-agentic"]: { prompts_dir, expected_files }`. Validated by `phases.ts:validatePhases`.
  - `state.json` v2: `selected_style_per_spot: Record<spotId, "fill-in-blank" | "prompted-agentic">`.
- **`selectStyle` MCP tool** — accepts both styles syntactically, persists Style A, returns `style-not-yet-supported` for Style B (the wire surface PR 2 lights up).
- **`nextSpot`** returns `available_styles` and `selected_style` so the conductor agent can render the picker.
- **`paths/01-orderbook-viewer/prompts/`** — empty directory (placeholder + .gitkeep). PR 2 populates per-spot subdirectories.

## Open design questions PR 2 must resolve

1. **Prompt content shape** — concretely: how many prompts per spot? Markdown only, or markdown + frontmatter? Substituted with personalization values via `substitutePromptOnly` (yes — same scope rule)? Files live at `paths/<slug>/prompts/<spot-id>/<n>.md` per the schema. PR 2 needs to author prompt sequences for `p1-spot-1`, `p2-spot-1`, `p3-spot-1`.

2. **Conductor handoff** — three options:
   1. New MCP tool `getNextPrompt({ projectRoot, spotId })` returns the next unrendered prompt's markdown. State tracks per-spot prompt cursor.
   2. Extend `nextSpot` to bundle the full prompt sequence in the spot view when `selected_style === "prompted-agentic"`.
   3. Conductor agent reads `prompts_dir` directly and walks the files itself. Simplest, but couples agent to repo layout — same anti-pattern F-001 wants to fix.

   Recommendation: option (1). It keeps prompt rendering server-side, parallel to the existing rung pattern, and stays compatible with the "agent never reads path content directly" invariant.

3. **Verification semantics** — when does `verifySpot` run?
   - Option A: Same as Style A — the learner finishes the agentic flow, runs `verifySpot`, which runs `pnpm build`. Passes when the file compiles.
   - Option B: Add a "ready to verify" signal — the learner explicitly tells Claude "I'm done with this spot", which calls a new tool, which then runs `verifySpot`.
   - Option C: Auto-trigger `verifySpot` after the last prompt is rendered.

   Recommendation: option (A). It keeps the verification model uniform across styles. PR 2 doesn't need to add new tool surface for verification.

4. **Help ladder integration** — does Style B keep all three rungs?
   - Rung 1 (hint) — same UX, just a narrative hint pointing at which prompt to lean on.
   - Rung 2 (reference) — same; show the canonical answer.
   - Rung 3 (auto-write) — does it still make sense? In Style B the learner orchestrates Claude themselves; the auto-write reference splice is essentially "give up and let the course write it." Probably keep it as the same fallback.

   Recommendation: keep all three rungs unchanged. The same `auto.md` content works for both styles.

5. **State growth** — does PR 2 need any new state fields?
   - Possibly `prompt_cursor_per_spot: Record<spotId, number>` for option (1) above.
   - If yes, `STATE_SCHEMA_VERSION` bumps from 2 → 3. Existing recovery code already handles schema-mismatch by re-running selectPath.

6. **Mid-spot style switch** — what happens if the learner picks Style A, makes edits, then runs `selectStyle({ style: "prompted-agentic" })`?
   - Their file edits stay in the workspace.
   - Probably: warn the conductor that switching mid-spot doesn't reset progress, and let them choose to `resetWorkspace` if needed.

7. **Style B for paths without prompts** — `paths/01-orderbook-viewer/phases.json` declares `styles["prompted-agentic"]` for every spot but `prompts/` is empty in PR 1. PR 2 needs to either populate prompts OR add a "prompts not yet authored" check that prevents `selectStyle("prompted-agentic")` from succeeding even after the gate is removed.

## Files expected to change in PR 2

- **`mcp/server/src/tools/selectStyle.ts`** — drop the `style-not-yet-supported` branch when prompts exist for the requested spot.
- **`mcp/server/src/tools/getNextPrompt.ts`** (NEW) — implements option (1) from question #2.
- **`mcp/server/src/index.ts`** — register the new tool. Update tool count assertions in tests to 9.
- **`mcp/server/src/schemas/state.ts`** — add `prompt_cursor_per_spot`, bump `STATE_SCHEMA_VERSION` to 3.
- **`agents/course-conductor.md`** — new section on the Style B flow: render the picker, drive prompts, verify when the learner says they're done.
- **`paths/01-orderbook-viewer/prompts/p1-spot-1/01-foundation.md`** ... **`<n>.md`** — author prompts for each spot.
- **Tests**:
  - `tests/getNextPrompt.test.ts` (NEW)
  - `tests/selectStyle.test.ts` — drop the `style-not-yet-supported` assertion, add success cases.
  - `tests/harness.lesson.test.ts` — add an end-to-end Style B walkthrough test.

## Migration / compatibility

- Anyone mid-path when PR 2 ships has `state.selected_style_per_spot["spot-id"] = "fill-in-blank"` already (or absent — both fine). PR 2 adds nothing destructive.
- The `STATE_SCHEMA_VERSION` bump (2 → 3) follows the same recovery flow as F-005's bump: schema-mismatch warning → learner re-runs `selectPath` → fresh v3 state minted.
- `paths/01-orderbook-viewer/phases.json` already declares `styles["prompted-agentic"]` for all three spots — PR 2 only needs to populate `prompts/` directories.

## Things explicitly *out of scope* for PR 2

- **Symlink-into-sandbox** lesson architecture (the original F-005 rant included it; PR 1 deferred). Verification runs in the workspace directly. Reconsider in PR 3+ if there's a real reason to integrate with the sandbox dashboard.
- **Per-spot starter reseed on cursor advance** — see open question #6. Out of scope unless PR 2 explicitly takes it on.
- **F-001..F-004 walkthrough feedback items** — tracked in `WALKTHROUGH_FEEDBACK.md`. Independent of Style B.
