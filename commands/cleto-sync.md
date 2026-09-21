---
description: Sync delta specs from a change to main specs
---

Invoke the `ancleto-sync-specs` skill with the Skill tool and follow it exactly; do not improvise steps.

**Input**: Optionally specify a change name after `/cleto-sync` (e.g., `/cleto-sync add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

Work Item grounding (when the request references a Work Item) is owned by `@context-resolver`.
