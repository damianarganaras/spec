---
name: ancleto-apply
description: Implement tasks from a change step by step, tracking progress in tasks.md. Use when artifacts are ready and implementation should start. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# OpenSpec Apply

Implement the tasks of a change, working directly from its artifact files. No external binaries are invoked: task state lives in `tasks.md` checkboxes.

**Input**: Optionally specify a change name (e.g., `add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous, list the directories under `openspec/changes/` and ask the user to select.

## Steps

### 1. Select the change

- If a name is provided, use it. Announce: "Using change: `<name>`" and how to override.
- If omitted: infer from conversation context; auto-select if only one active change directory exists under `openspec/changes/`; otherwise list the directories and ask the user to choose.

**IMPORTANT**: Do NOT guess or auto-select when ambiguous. Always let the user choose.

### 2. Understand the change state

Read the change directory `openspec/changes/<name>/` and load:

- `proposal.md` — what & why (if present)
- `design.md` — approach and decisions (if present)
- `tasks.md` — the task list with checkbox state (required)
- `specs/` — delta requirements (if present)

If `tasks.md` is missing, report it and stop: there is nothing to implement. Suggest completing the artifacts first.

### 3. Read context files

Read every artifact found in step 2 before writing any code:

- **proposal + design**: the intent and the chosen approach
- **specs/**: the exact required behavior and scenarios
- **tasks.md**: the ordered checklist

Do not assume file names beyond these four; read what exists.

### 4. Show current progress

Display:

- Tasks completed vs total (count `- [x]` vs `- [ ]` in `tasks.md`)
- Remaining tasks overview

### 5. Implement tasks (loop until done or blocked)

For each pending task (`- [ ]`):

- Show which task is being worked on
- Make the code changes required
- Keep changes minimal and focused
- Mark the task complete in the tasks file: `- [ ]` → `- [x]`
- Continue to the next task

**Pause if:**

- Task is unclear → ask for clarification
- Implementation reveals a design issue → suggest updating artifacts
- Error or blocker encountered → report and wait for guidance
- User interrupts

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
<description of the issue>

What would you like to do?
```

## Output During Implementation

```
## Implementing: <change-name>

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete
```

## Guardrails

- Keep going through tasks until done or blocked
- Always read the change artifacts before starting
- If a task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update the task checkbox immediately after completing each task
- Pause on errors, blockers, or unclear requirements — don't guess
- An implementation task may be revisited: if artifacts change mid-flight, re-read them before continuing
