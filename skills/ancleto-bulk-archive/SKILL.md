---
name: ancleto-bulk-archive
description: Archive multiple completed changes in one batch, resolving spec conflicts by checking the codebase. Use when several changes are done and should be archived together. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Bulk Archive

**Artifacts language**: write every artifact in English. Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) are literal and MUST NOT be translated. File and directory names stay English kebab-case.

Archive many completed changes at once, resolving spec conflicts against the implementation. No external binaries.

**Input**: None required (prompts for selection).

## Steps

### 1. Get active changes

List `aspec/changes/` dirs (excluding `archive/`); if none, inform and stop.

### 2. Prompt for change selection

Ask the user to choose (runtime question tool with multi-select when available):

- Show each change
- Include an "All changes" option
- Allow any number of selections (1+)

**IMPORTANT**: Do NOT auto-select. Always let the user choose.

### 3. Batch validation

Read per change:

a. **Artifacts** — which of `proposal.md`, `design.md`, `tasks.md`, `specs/` exist under `aspec/changes/<name>/`.
b. **Tasks** — count `- [ ]` vs `- [x]`; if no tasks file, note "No tasks".
c. **Delta specs** — list capability specs under `specs/`, extracting `### Requirement: <name>` lines.

### 4. Detect spec conflicts

Map `capability -> [changes that touch it]`:

```
auth -> [change-a, change-b]  <- CONFLICT (2+ changes)
api  -> [change-c]            <- OK (only 1 change)
```

Conflict = 2+ selected changes with delta specs for the same capability.

### 5. Resolve conflicts

Per conflict:

a. **Read each conflicting delta spec** — what it claims to add/modify.
b. **Search the codebase** for implementation evidence.
c. **Resolution**: only one implemented → sync that one; both → apply chronologically (older first, newer overwrites); neither → skip sync, warn the user.
d. **Record the resolution** (which specs apply, order, rationale).

### 6. Status table

```
| Change     | Artifacts | Tasks | Specs   | Conflicts | Status |
|------------|-----------|-------|---------|-----------|--------|
| add-oauth  | Done      | 4/4   | 1 delta | None      | Ready  |
```

Show resolutions and warnings for incomplete changes.

### 7. Confirm the batch

Ask once (runtime question tool when available): "Archive N changes?" — "Archive all N changes" / "Archive only N ready changes (skip incomplete)" / "Cancel". Incomplete changes are archived with warnings.

### 8. Execute archive

Process in the determined order:

a. **Sync specs** if delta specs exist and the resolution says so: apply the delta to `aspec/specs/<capability>/spec.md` (ADDED adds; MODIFIED updates preserving unmentioned scenarios; REMOVED deletes; RENAMED renames via `FROM:`/`TO:`). Track sync.
b. **Archive**: create `aspec/changes/archive/` if missing, delete scaffold-only files (`context.md`), move to `aspec/changes/archive/YYYY-MM-DD-<name>/`. If the target exists, fail that change (record the error) but continue.
c. **Track outcomes**: success, failed (with error), skipped.

### 9. Record lessons

Per resolved conflict and durable lesson:

- Resolutions/decisions (which change won, why, evidence) → `recordDecision`:
  ```
  recordDecision({ memory_key: "<kebab-topic>", content: "<resolution>", justification: "<codebase evidence>" })
  ```
- Standing rules discovered (e.g., "these two capabilities must evolve together") → `recordRule`:
  ```
  recordRule({ memory_key: "<kebab-topic>", content: "<the rule>", justification: "<evidence>" })
  ```

Record only what saves future investigation; never workflow meta. If nothing meets the bar, record nothing and say so.

### 10. Display summary

```
## Bulk Archive Complete

Archived N changes: <change-1> -> archive/YYYY-MM-DD-<change-1>/
Skipped M: <change-2> (incomplete; user declined)
Spec sync: N delta specs synced, M conflicts resolved
**Memories recorded:** <list, or "None">
```

## Guardrails

- Any number of changes (1+ fine, 2+ typical).
- Prompt for selection; never auto-select.
- Detect conflicts early; resolve via the codebase (chronological when both implemented).
- Skip spec sync only when implementation is missing (warn the user).
- Show per-change status before one batch confirmation.
- Track and report all outcomes (success/skip/fail).
- Archive target: current date (`YYYY-MM-DD-<name>`); if it exists, fail that change but continue others.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
