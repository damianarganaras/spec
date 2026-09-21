---
name: ancleto-archive
description: Archive a completed change, syncing delta specs first when needed. Use when implementation and verification are done. Captures lessons into persistent memory. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# OpenSpec Archive

Archive a completed change by moving its directory, after checking completion and syncing delta specs. No external binaries are invoked: completion is read from files, archiving is a directory move.

**Input**: Optionally specify a change name (e.g., `add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous, list the directories under `openspec/changes/` (excluding `archive/`) and ask the user to select.

**IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

## Steps

### 1. Check task completion status

Read `openspec/changes/<name>/tasks.md` (when it exists) and count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

- **If incomplete tasks found**: display a warning showing the count, prompt the user for confirmation to continue, and proceed only if confirmed.
- **If no tasks file exists**: proceed without a task-related warning.

### 2. Assess delta spec sync state

Check for delta specs at `openspec/changes/<name>/specs/`. If none exist, proceed without a sync prompt.

**If delta specs exist:**

- Compare each delta spec with its corresponding main spec at `openspec/specs/<capability>/spec.md`.
- Determine what would change (adds, modifications, removals, renames) and show a combined summary.
- Prompt the user: "Sync now (recommended)" vs "Archive without syncing" (or "Archive now" / "Sync anyway" / "Cancel" when already synced).
- If the user chooses sync, apply the delta to the main spec directly, editing `openspec/specs/<capability>/spec.md`:
  - `## ADDED Requirements` → add the new requirement blocks (skip those already present).
  - `## MODIFIED Requirements` → update the matching requirement, preserving scenarios not mentioned in the delta.
  - `## REMOVED Requirements` → remove the entire requirement block.
  - `## RENAMED Requirements` → rename using the `FROM:`/`TO:` pair.
- Proceed to archive regardless of the choice.

### 3. Perform the archive

Create the archive directory if it does not exist: `openspec/changes/archive/`.

Generate the target name using the current date: `YYYY-MM-DD-<change-name>`.

- **If the target already exists**: fail with an error suggesting to rename the existing archive or pick a different date.
- **If not**: delete scaffold-only files (e.g., `openspec/changes/<name>/context.md` — they must not be preserved), then move the whole change directory to `openspec/changes/archive/YYYY-MM-DD-<name>/`.

### 4. Capture lessons into persistent memory

Record what this change taught, using the memory tools:

- Architectural decisions taken during the change, with their reasons → `recordDecision`, e.g.:
  ```
  recordDecision({ memory_key: "<kebab-topic>", content: "<the decision>", justification: "<why this path>" })
  ```
- Standing rules or constraints discovered (things future agents must keep following) → `recordRule`, e.g.:
  ```
  recordRule({ memory_key: "<kebab-topic>", content: "<the rule>", justification: "<evidence>" })
  ```

Record only durable lessons — decisions whose reasons are not visible in the result, constraints, verified workarounds. Never record workflow meta (what was reviewed, approved, or classified). If nothing meets the bar, record nothing and say so.

### 5. Display summary

```
## Archive Complete

**Change:** <change-name>
**Archived to:** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or: No delta specs / Sync skipped)

**Memories recorded:** <list, or "None">
```

If warnings applied (incomplete tasks, skipped sync), show an "Archive Complete (with warnings)" variant listing them.

## Guardrails

- Always prompt for change selection if not provided.
- Don't block archiving on warnings — just inform and confirm.
- If target archive directory already exists, fail instead of overwriting.
- Delete scaffold-only files (`context.md`) before moving; never archive them.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
