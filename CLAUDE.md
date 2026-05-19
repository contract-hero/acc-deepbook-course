# acc-deepbook-course — Claude's working notes

A content plugin for the [Agentic Community College (ACC)](https://github.com/alilloig/agentic-community-college) framework. Bundles the DeepBook lessons. **No runtime code here** — the framework owns that.

If you're looking at this repo with confusion, the directory may still be named `sui-mcp-course/` on disk while the plugin name has been updated to `acc-deepbook-course`. The directory rename + GitHub repo rename are manual user actions; they're cosmetic, since the plugin manifest is what Claude Code reads.

## What you can do here

- **Author a new lesson** — don't write files by hand. Invoke ACC's `lesson-creator` skill and point it at this repo + a reference codebase. The skill emits the entire `lessons/<slug>/` tree.
- **Refine an existing lesson** — edit `lessons/<slug>/{lesson.json, sections.json, sections/*.md, artifact/template.html, tests/}` directly. Re-run the lesson-creator's validation pass after edits to confirm the prompts still produce passing tests in both output modes.
- **Add a new test** — `lessons/<slug>/tests/` is the equivalence gate. Tests run via vitest from inside the lesson's seeded workspace (`~/.acc/workspaces/<slug>/`).

## What NOT to do here

- Don't add MCP server code, agents, or framework skills. Those live in `agentic-community-college`.
- Don't add a top-level `agents/` or `skills/` directory; agents and framework skills live in `agentic-community-college`. The `commands/` directory is allowed — `commands/start.md` is the load-bearing entry point that course-engine boots from.

## Schema reference

Every lesson directory follows the shape:

```
lessons/<slug>/
├── lesson.json            slug, title, summary, personalization, workspace, artifact
├── description.md         rendered before personalization in the conductor
├── sections.json          ordered section sequence + final_verification
├── sections/              one .md per section (the prompt bodies)
├── reference-app/         hard copy of the reference codebase + offline fixtures
├── tests/                 unit / scenario / e2e (vitest)
├── artifact/template.html self-contained evolving HTML; copied into the workspace
├── hosts/                 (when present) Vite hosts for F-005 workspace lifecycle
└── validation.json        per-mode test results, emitted by lesson-creator
```

Schema validators live in `agentic-community-college/mcp/server/src/schemas/{lesson,sections}.ts`. When in doubt about what a field means or what's required, read those files — they're the source of truth.

## Personalization placeholders

Section bodies can contain `{{ key }}` placeholders that the conductor substitutes against the user's personalization values. Substitution is **scoped to section bodies only** — never put `{{ ... }}` inside `target_file`, `verification.command`, or any path. (Path-traversal guard.)

The course-injected placeholder `{{ workspace_path }}` is reserved (resolved by the conductor server-side); don't shadow it with a personalization key of the same name.

## How a session runs (end-to-end)

1. User runs `/agentic-community-college:start` from their `projectRoot`.
2. ACC's `course-engine` skill calls `start` MCP tool → discovers this plugin via `~/.claude/plugins/installed_plugins.json`, validates every lesson manifest pair, and renders the catalog.
3. User picks a namespaced slug → `selectLesson` mints v4 state at `<projectRoot>/.acc/state.json`, seeds the workspace at `~/.acc/workspaces/<slug>/` from the lesson's `reference-app` + host files.
4. User picks `learning` or `explanatory` → `setOutputMode` persists.
5. User answers personalization (or accepts defaults) → `setPersonalization`.
6. `course-conductor` agent loops: `advanceArtifact` → `nextSection` → user/agent edits → `verifySection` → repeat.
7. On the final section's `verifySection`, the lesson's `final_verification` (vitest) gates completion.
