# /acc-deepbook-course:start

Start a lesson in **acc-deepbook-course** — the DeepBook track of the Agentic Community College.

You're about to build something against the real Sui DeepBook sandbox, hand-driving the integration yourself end-to-end. Each lesson ships a test gate that says you got it right.

To begin, invoke ACC's `course-engine` skill (from the `agentic-community-college` plugin) with a course filter pinned to `acc-deepbook-course` — that will list only this course's lessons, walk the learner through selection, run the lesson's prerequisite probes (Node, pnpm, Docker, Sui CLI, sui-pilot, sandbox repo, sandbox manifest), collect output mode (learning vs explanatory) and personalization, and hand off to the `course-conductor` agent for the section loop.

If `agentic-community-college` isn't enabled, the user needs to install it first: `claude plugins install agentic-community-college@contract-hero`.
