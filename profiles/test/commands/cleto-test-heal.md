---
description: Diagnose and repair a failing Playwright test
---

You are running the test-automation **healing** workflow under the test profile.

1. Reproduce the failure first (run the single failing test, not the whole suite).
2. Diagnose: product bug vs stale test vs environment issue.
3. Fix the smaller side: update the test when the behavior change was intentional; touch product code only within the orchestrator-approved scope, otherwise escalate to `@orchestrator` for reclassification.
4. Re-run to green and report cause, side fixed, and commands run.
