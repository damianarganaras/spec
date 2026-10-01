---
description: Propose what to automate (test planning) as a testing change
---

You are running the test-automation **planning** workflow under the test profile.

1. Read the approved change artifacts (or the orchestrator brief) and the current Playwright suite layout.
2. Define the coverage target: critical flows, edge cases, regressions.
3. Check the Playwright precondition (`package.json` / `playwright.config.*`): if absent, plan analysis-only and say so.
4. Record the plan as a testing change under `testspec/changes/{name}/` (proposal + tasks; reuse `aspec/changes/{name}/` when the project reuses aspec). STOP and wait for approval before generating tests.
