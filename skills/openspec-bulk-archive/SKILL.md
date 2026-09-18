---
name: openspec-bulk-archive
description: Archive multiple completed changes in one batch, resolving spec conflicts by checking the codebase. Use when several changes are done and should be archived together. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# OpenSpec Bulk Archive

Archive multiple completed changes in a single operation, handling spec conflicts by checking what is actually implemented. No external binaries are invoked: changes are listed from directories, status is read from files, archiving is a directory move.

**Input**: None required (prompts for selection).

## Steps

### 1. Get active changes

List the directories directly under `openspec/changes/` (excluding `archive/`). If none exist, inform the user and stop.

### 2. Prompt for change selection

Use the **AskUserQuestion tool** with multi-select to let the user choose:

- Show each change (no schema inference needed — all changes follow the same artifact layout)
- Include an option for "All changes"
- Allow any number of selections (1+ works, 2+ is the typical use case)

**IMPORTANT**: Do NOT auto-select. Always let the user choose.

### 3. Batch validation — gather status for each selected change

For each selected change, collect by reading files:

a. **Artifact presence** — which of `proposal.md`, `design.md`, `tasks.md`, `specs/` exist under `openspec/changes/<name>/`.

b. **Task completion** — read `openspec/changes/<name>/tasks.md` and count `- [ ]` (incomplete) vs `- [x]` (complete). If no tasks file exists, note "No tasks".

c. **Delta specs** — check `openspec/changes/<name>/specs/` and list which capability specs exist, extracting requirement names (lines matching `### Requirement: <name>`).

### 4. Detect spec conflicts

Build a map of `capability -> [changes that touch it]`:

```
auth -> [change-a, change-b]  <- CONFLICT (2+ changes)
api  -> [change-c]            <- OK (only 1 change)
```

A conflict exists when 2+ selected changes have delta specs for the same capability.

### 5. Resolve conflicts by checking the codebase

**For each conflict**, investigate:

a. **Read the delta specs** from each conflicting change to understand what each claims to add or modify.

b. **Search the codebase** for implementation evidence: code implementing requirements from each delta spec, related files, functions, or tests.

c. **Determine resolution**:

- If only one change is actually implemented → sync that one's specs.
- If both are implemented → apply in chronological order (older first, newer overwrites).
- If neither is implemented → skip spec sync, warn the user.

d. **Record the resolution** (which change's specs to apply, in what order, and the rationale).

### 6. Show the consolidated status table

```
| Change     | Artifacts | Tasks | Specs   | Conflicts | Status |
|------------|-----------|-------|---------|-----------|--------|
| add-oauth  | Done      | 4/4   | 1 delta | None      | Ready  |
```

For conflicts, show the resolution. For incomplete changes, show warnings.

### 7. Confirm the batch operation

Use the **AskUserQuestion tool** with a single confirmation:

- "Archive N changes?" — options: "Archive all N changes", "Archive only N ready changes (skip incomplete)", "Cancel".

If there are incomplete changes, make clear they will be archived with warnings.

### 8. Execute the archive for each confirmed change

Process changes in the determined order (respecting conflict resolution):

a. **Sync specs** if delta specs exist and the resolution says so: apply the delta directly to `openspec/specs/<capability>/spec.md` (ADDED adds, MODIFIED updates preserving unmentioned scenarios, REMOVED deletes, RENAMED renames via `FROM:`/`TO:`). Track whether sync was done.

b. **Perform the archive**: create `openspec/changes/archive/` if missing, delete scaffold-only files (`context.md`), then move the directory to `openspec/changes/archive/YYYY-MM-DD-<name>/`. If the target already exists, fail that change (record the error) but continue with the others.

c. **Track each outcome**: success, failed (with error), or skipped.

### 9. Record conflict resolutions and lessons into persistent memory

For every resolved conflict and every durable lesson this batch taught, record it:

- Conflict resolutions and design decisions (which change won, why, what the codebase showed) → `recordDecision`, e.g.:
  ```
  recordDecision({ memory_key: "<kebab-topic>", content: "<resolution>", justification: "<codebase evidence>" })
  ```
- Standing rules discovered (e.g., "these two capabilities must evolve together") → `recordRule`, e.g.:
  ```
  recordRule({ memory_key: "<kebab-topic>", content: "<the rule>", justification: "<evidence>" })
  ```

Record only what would save future investigation. Never record workflow meta. If nothing meets the bar, record nothing and say so.

### 10. Display summary

```
## Bulk Archive Complete

Archived N changes:
- <change-1> -> archive/YYYY-MM-DD-<change-1>/

Skipped M changes:
- <change-2> (user chose not to archive incomplete)

Spec sync summary:
- N delta specs synced to main specs
- M conflicts resolved

**Memories recorded:** <list, or "None">
```

## Guardrails

- Allow any number of changes (1+ is fine, 2+ is the typical use case).
- Always prompt for selection, never auto-select.
- Detect spec conflicts early and resolve by checking the codebase.
- When both changes are implemented, apply specs in chronological order.
- Skip spec sync only when implementation is missing (warn the user).
- Show clear per-change status before confirming.
- Use a single confirmation for the entire batch.
- Track and report all outcomes (success/skip/fail).
- Archive directory target uses the current date: `YYYY-MM-DD-<name>`.
- If an archive target exists, fail that change but continue with others.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
