---
name: ancleto-apply
description: Implement tasks from a change step by step, tracking progress in tasks.md. Use when artifacts are ready and implementation should start. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Apply

Implement a change's tasks directly from its artifact files. No external binaries: task state lives in `tasks.md` checkboxes.

**Input**: optionally a change name (e.g., `add-auth`). If omitted, try to infer it from conversation context; if vague, list the directories under `aspec/changes/` and ask the user to select.

## Steps

### 1. Select the change

- If a name is provided, use it. Announce: "Using change: `<name>`" and how to override.
- If omitted: infer from context; auto-select if only one active change directory exists; otherwise list them and ask the user to choose.

**IMPORTANT**: Do NOT guess or auto-select when ambiguous. Always let the user choose.

### 2. Understand the change state

Read `aspec/changes/<name>/` and load:

- `proposal.md` — what & why (if present)
- `design.md` — approach and decisions (if present)
- `tasks.md` — task list with checkbox state (required)
- `specs/` — delta requirements (if present)

If `tasks.md` is missing, report it and stop: nothing to implement. Suggest completing the artifacts first.

### 3. Read context files

Read every artifact found in step 2 before writing code; do not assume file names beyond these four.

### 4. Show current progress

- Tasks completed vs total (count `- [x]` vs `- [ ]` in `tasks.md`)
- Remaining tasks overview

### 5. Implement tasks (loop until done or blocked)

For each pending task (`- [ ]`): show which task; make the required changes, minimal and focused; mark it `- [x]`; continue to the next.

**Pause if:** task is unclear → ask; implementation reveals a design issue → suggest updating artifacts; error or blocker → report and wait; user interrupts.

### 6. On completion or pause, show status

**On completion:**

```
## Implementation Complete

**Change:** <change-name>
**Progress:** N/N tasks complete ✓

All tasks complete! You can archive this change with `ancleto-archive`.
```

**On pause:**

```
## Implementation Paused

**Change:** <change-name>
**Progress:** M/N tasks complete

### Issue Encountered
<description>

What would you like to do?
```

## Output During Implementation

```
## Implementing: <change-name>

Working on task 3/7: <task description>
[...]
✓ Task complete
```

## Guardrails

- Read the change artifacts before starting.
- Pause on ambiguous tasks, design issues, errors, blockers, or unclear requirements — don't guess.
- Keep code changes minimal and scoped to each task; update the checkbox immediately after each.
- If artifacts change mid-flight, re-read them before continuing.
