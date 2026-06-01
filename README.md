# acc-deepbook-course

> A hands-on Sui DeepBook course that runs inside Claude Code, built on the Agentic Community College (ACC) framework.

<!-- TODO: 2-minute overview link → https://contract-hero.github.io/acc-deepbook-course/ -->

## Install

```text
/plugin marketplace add contract-hero/plugin-marketplace
/plugin install agentic-community-college@contract-hero
/plugin install acc-deepbook-course@contract-hero
/acc-deepbook-course:start
```

Requires `agentic-community-college@contract-hero` ≥ `0.2.0` and Docker running for the auto-bootstrapped sandbox stack.

## Lessons

<!-- TODO: one bullet per lesson once the snippets in lessons/_snippets/ are authored into lessons. -->

## Links

- **Framework** — [`agentic-community-college`](https://github.com/contract-hero/agentic-community-college)
- **Marketplace** — [`contract-hero/plugin-marketplace`](https://github.com/contract-hero/plugin-marketplace)
- **Reference sandbox** — [`MystenLabs/deepbook-sandbox`](https://github.com/MystenLabs/deepbook-sandbox) (auto-cloned by ACC; you don't have to)

## For contributors

If you're editing the course itself, see [`CLAUDE.md`](./CLAUDE.md) for the lesson schema, what NOT to add (no MCP/agent code — that's the framework's job), and the per-section authoring flow.

```bash
# from a lesson's reference-app/ directory
pnpm install
pnpm exec vitest run    # the equivalence gate
```

Don't write lesson files by hand — invoke ACC's `agentic-community-college:lesson-creator` skill instead. It scaffolds the whole `lessons/<slug>/` tree (manifest, sections, tests, artifact, reference-app) against a reference codebase. The runnable reference apps live in [`lessons/_snippets/`](./lessons/_snippets/).
