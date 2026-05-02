# PR 2 Bootstrap — RETIRED

PR 2 has shipped. The `prompted-agentic` style is now functional, F-001 through F-004 are addressed, and `STATE_SCHEMA_VERSION` is at 3.

What this doc described as future work is now reality:

- ✅ `getNextPrompt` MCP tool implemented at `mcp/server/src/tools/getNextPrompt.ts`. Walks `paths/<slug>/prompts/<spot-id>/<NN>.md` in lexical order, advances the per-spot cursor, applies `{{ ... }}` substitutions.
- ✅ `state.prompt_cursor_per_spot` added; `STATE_SCHEMA_VERSION` bumped 2 → 3.
- ✅ `selectStyle` honors `prompted-agentic` once at least one `.md` file lives under the spot's `prompts_dir`. Empty directories return `prompts-not-authored`.
- ✅ Four prompts authored at `paths/01-orderbook-viewer/prompts/p1-spot-1/` covering orientation, `packageIds`, `coinMap` + `poolMap`, and a verify-and-reflect close.
- ✅ `agents/course-conductor.md` gained a "Per-style flow" section that drives both Style A and Style B.

For future work, see `WALKTHROUGH_FEEDBACK.md` and any new feedback that lands during the next walkthrough. This file is kept so links from PR 1 remain resolvable; new PRs should reference `WALKTHROUGH_FEEDBACK.md` instead.
