---
description: Review scoped code for duplication, redundancy, misplacement and dead code
---

Invoke the `ancleto-review` skill with the Skill tool and follow it exactly; do not improvise steps.

**Input**: The argument after `/cleto-review` is the scope to review: a ticket reference (e.g. `#123`, resolved to commits whose message contains it), a git range (e.g. `main..HEAD`), or paths/directories. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available scopes.

Work Item grounding (when the request references a Work Item) is owned by `@context-resolver`.
