---
name: ancleto-archive
description: Archive a completed change, syncing delta specs first when needed. Use when implementation and verification are done. Captures lessons into persistent memory. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Archive

**Artifacts language**: write every artifact in English. Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) are literal and MUST NOT be translated. File and directory names stay English kebab-case.

Archive a completed change: check completion, sync delta specs, move the directory. No external binaries.

**Input**: Optionally a change name (e.g., `add-auth`); if omitted, infer from context. If ambiguous, list `aspec/changes/` dirs (excluding `archive/`) and ask the user to select.

**IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

## Steps

### 1. Check task completion status

Read `aspec/changes/<name>/tasks.md` (when present); count `- [ ]` (incomplete) vs `- [x]` (complete).

- **Incomplete tasks**: warn with the count, prompt for confirmation, proceed only if confirmed.
- **No tasks file**: proceed without a task warning.

### 2. Assess delta spec sync state

Check for delta specs at `aspec/changes/<name>/specs/`; if none, proceed without a sync prompt.

**If delta specs exist:**

- Diff each delta against its main spec at `aspec/specs/<capability>/spec.md`; show a combined summary of adds/modifications/removals/renames.
- Prompt: "Sync now (recommended)" vs "Archive without syncing" (or "Archive now" / "Sync anyway" / "Cancel" when already synced).
- If the user chooses sync, edit `aspec/specs/<capability>/spec.md`:
  - `## ADDED Requirements` → add new blocks (skip those already present).
  - `## MODIFIED Requirements` → update the matching requirement, preserving scenarios not mentioned in the delta.
  - `## REMOVED Requirements` → remove the entire requirement block.
  - `## RENAMED Requirements` → rename using the `FROM:`/`TO:` pair.
- Proceed to archive regardless of the choice.

### 3. Check technical seed freshness

If the `ancleto` CLI is available in this project, run `ancleto discovery --check` (read-only) and read its JSON `state`.

- **`STALE`**: warn that the technical seed is out of date for the current code, and offer to regenerate it now (follow the `ancleto-technical-discovery` skill) or to continue archiving with the stale seed.
- **Any other state**: continue without comment.
- Never regenerate automatically — regenerate only with the user's explicit approval.
- If the user declines, continue the archive normally and record the stale seed in the summary.
- If the CLI is unavailable, skip this step.

### 4. Perform the archive

Create `aspec/changes/archive/` if absent. Target: `YYYY-MM-DD-<change-name>` (current date).

- **Target exists**: fail, suggesting a rename or different date.
- **Otherwise**: delete scaffold-only files (e.g., `aspec/changes/<name>/context.md` — never preserved), then move the change directory to `aspec/changes/archive/YYYY-MM-DD-<name>/`.

### 5. Capture lessons into persistent memory

Record what this change taught:

- Architectural decisions taken, with reasons → `recordDecision`:
  ```
  recordDecision({ memory_key: "<kebab-topic>", content: "<the decision>", justification: "<why this path>" })
  ```
- Standing rules or constraints discovered (future agents must keep following) → `recordRule`:
  ```
  recordRule({ memory_key: "<kebab-topic>", content: "<the rule>", justification: "<evidence>" })
  ```

Record only durable lessons — decisions whose reasons aren't visible in the result, constraints, verified workarounds. Never workflow meta. If nothing meets the bar, record nothing and say so.

### 6. Display summary

```
## Archive Complete

**Change:** <change-name>
**Archived to:** aspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced (or: No delta specs / Sync skipped)
**Memories recorded:** <list, or "None">
```

When the seed was `STALE`, add a `**Seed:**` line: `Regenerated` or `Stale — regeneration declined`.

If warnings applied (incomplete tasks, skipped sync, stale seed), show an "Archive Complete (with warnings)" variant listing them.

## Guardrails

- Always prompt for change selection if not provided.
- Don't block archiving on warnings — inform and confirm.
- Never regenerate the technical seed automatically: offer it, and continue the archive if the user declines.
- If the target archive directory exists, fail instead of overwriting.
- Delete scaffold-only files (`context.md`) before moving; never archive them.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
