---
description: Generate Playwright tests from an approved testing plan
---

You are running the test-automation **generation** workflow under the test profile.

1. Load the approved testing plan (`testspec/changes/{name}/` or the aspec change).
2. Verify the Playwright precondition; if absent, stop and report instead of generating runnable tests.
3. Generate one Playwright test per plan item using the repo's existing patterns. Map each test to its item.
4. Report untestable items as gaps (never skip silently) and hand the new tests to validation (healing/coverage as needed).
