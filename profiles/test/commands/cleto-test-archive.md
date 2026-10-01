---
description: Archive a finished testing change
---

You are running the test-automation **archive** workflow under the test profile.

1. Verify the testing change is complete: plan approved, tests generated, suite green (or gaps explicitly accepted).
2. Confirm the delta specs reflect the final tests (re-delegate updates when behavior changed mid-flight).
3. Archive per the project's SDD close process (same rules as `cleto-archive`), keeping `testspec/` deltas consistent.
