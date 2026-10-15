---
description: Update a change's artifacts when a definition changed
---

Invoke the `ancleto-update` skill with the Skill tool and follow it exactly; do not improvise steps.

**Input**: the argument after `/cleto-update` is a change name (kebab-case) and what changed (a definition to apply, or a spec that already changed). If the change name is omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

This is the artifact-update skill, not the CLI `ancleto update` (which reinstalls the package).

Work Item grounding (when the request references a Work Item) is owned by `@context-resolver`.
