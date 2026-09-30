---
description: Report gaps between specs and existing automation
---

You are running the test-automation **coverage** workflow under the test profile.

1. Read the source-of-truth specs (`testspec/specs/` or `aspec/specs/`) plus active deltas.
2. Map each requirement to the existing Playwright tests (no execution needed — static analysis suffices).
3. Output a prioritized gap list: requirements without automation, tests without a backing requirement.
4. Do not write new tests here; propose them via `cleto-test-proposal` when asked.
