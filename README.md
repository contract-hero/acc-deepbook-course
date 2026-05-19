# acc-deepbook-course

A **content plugin** for the [Agentic Community College (ACC)](https://github.com/alilloig/agentic-community-college) framework. This repo ships a curated set of DeepBook lessons; the ACC plugin owns the runtime that actually drives them.

This repository was previously `sui-mcp-course` and bundled both runtime + content. The runtime moved to `agentic-community-college` so the same engine can host courses for Walrus, Seal, Move, etc. without a fork.

## Install

The course is distributed through the [`contract-hero`](https://github.com/contract-hero/plugin-marketplace) Claude Code marketplace. From inside Claude Code:

```text
/plugin marketplace add contract-hero/plugin-marketplace
/plugin install agentic-community-college@contract-hero
/plugin install acc-deepbook-course@contract-hero
```

Then start a lesson with:

```text
/acc-deepbook-course:start
```

(or `/agentic-community-college:start` if you have multiple ACC courses installed and want the full catalog).

## Dependencies

The course's prerequisite probes are declared in `.claude-plugin/plugin.json` and run automatically when you start a lesson. If a probe fails, ACC stops and shows a remediation message. Most of these are **not** auto-installed — bring them up front to avoid bouncing off the probe gate.

### Required Claude Code plugins

All three are on the `contract-hero` marketplace:

| Plugin | Why | Install |
|---|---|---|
| `agentic-community-college` | Runtime that drives every lesson. | `/plugin install agentic-community-college@contract-hero` |
| `sui-pilot` | Doc-grounded Sui / Move guidance during lessons. | `/plugin install sui-pilot@contract-hero` |
| `toolkit` | `publish-html`, `html-artifact`, `for-dummies`, `move-call-chains` — used by the post-lesson publish offer and in-section scratch explainers. | `/plugin install toolkit@contract-hero` |

### System requirements

| Tool | Version | Used for |
|---|---|---|
| Node.js | 18+ | Running lesson reference apps + tests. |
| pnpm | latest | Package manager (npm/yarn are not supported). |
| Docker | running | Spinning up the local DeepBook sandbox. |
| Sui CLI | any current | Sandbox bring-up scripts use it directly. |

### External setup (auto-bootstrapped by ACC)

ACC handles both the sandbox checkout and the running stack as preflight remediations — you don't have to clone or deploy anything by hand:

- **deepbook-sandbox checkout** — ACC clones [MystenLabs/deepbook-sandbox](https://github.com/MystenLabs/deepbook-sandbox) into `<workspace_root>/deepbook-sandbox` on first lesson start (with `--recurse-submodules` + `pnpm install`). `workspace_root` defaults to `~/workspace`; the first ACC lesson on a fresh machine prompts you for it and persists the choice to `~/.acc/config.json`.
- **Sandbox faucet running on `http://localhost:9009`** — if the manifest endpoint is unreachable when a lesson starts, ACC offers to run `pnpm deploy-all --quick` from `<sandbox-path>/sandbox/`. Docker must be running.

To point at an existing sandbox checkout outside `<workspace_root>/deepbook-sandbox`, hand-edit `~/.acc/config.json`:

```json
{
  "workspace_root": "~/workspace",
  "course_paths": {
    "acc-deepbook-course@contract-hero": {
      "sandbox": "~/wherever/deepbook-sandbox"
    }
  }
}
```

Use `@local` instead of `@contract-hero` if you installed the course from a local marketplace. The canonical key is whatever appears for this plugin in `~/.claude/plugins/installed_plugins.json`. A `/acc:settings` CLI for editing this without touching JSON is on the framework's roadmap.

Bandwidth caveat: the cold path pulls ~500 MB of Docker images plus the sandbox checkout — first run will take several minutes and isn't great on cellular.

## How it plugs in

`.claude-plugin/plugin.json` declares:

```json
{
  "name": "acc-deepbook-course",
  "accContent": { "lessons": "./lessons/" }
}
```

When this plugin is enabled alongside `agentic-community-college`, ACC scans `~/.claude/plugins/installed_plugins.json` at startup, finds this manifest's `accContent.lessons`, and aggregates every lesson under `lessons/<slug>/` into its catalog.

## What's inside

```
acc-deepbook-course/
├── .claude-plugin/plugin.json    name=acc-deepbook-course, accContent + probes declared
├── commands/start.md             ships /acc-deepbook-course:start
├── README.md                     this file
├── CLAUDE.md                     working notes for Claude when authoring lessons here
└── lessons/                      one directory per lesson, each a hard copy of a reference app
                                  plus its ordered section sequence, tests, and HTML artifact
```

The first lesson, `01-market-stats`, is authored by ACC's `lesson-creator` skill against the reference app at `~/workspace/deepbook-sandbox-evaluation-apps/independent/01-market-stats/`.

## Authoring a new lesson

Don't write lesson files by hand. From inside any ACC-enabled session, invoke the `lesson-creator` skill (`agentic-community-college:lesson-creator`). Point it at this repo and a reference codebase, and it scaffolds the whole lesson directory — `lesson.json`, `sections.json`, `sections/*.md`, `tests/`, `reference-app/`, `artifact/template.html`, and the validation pass — for you.

## Running a lesson

1. Install (or enable) both this plugin **and** `agentic-community-college` in Claude Code (see **Install** above).
2. Run `/acc-deepbook-course:start` (or `/agentic-community-college:start`) from any project directory.
3. Pick a lesson by namespaced slug (e.g. `acc-deepbook-course@contract-hero/01-market-stats`).
4. ACC drives you through it — pick `learning` or `explanatory` mode, set personalization if any, and walk the section sequence.
