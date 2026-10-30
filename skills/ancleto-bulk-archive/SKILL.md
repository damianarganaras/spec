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

**Artifacts language**: follow the `LOCKED: artifacts-language` block in `AGENTS.md` (single source of truth for artifact language and literal keywords).

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

a. **Artifacts** — which of `proposal.md`, `tasks.md`, `specs/` exist under `aspec/changes/<name>/`.
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

a. **Preflight promotions** before touching the change: apply the promotion gate to the blocks under `## Decisiones` of its `proposal.md` (shape defined in `agents/spec-writer.md`; reference it, do not restate it here). A block without its own `memory_key` and `Estado: aprobado` is not a candidate, and only `decision` is promoted (never a `rule`). Any key/refs/`Estado` violation, a session candidate (transcript, task state, session summary), or two blocks sharing a `memory_key` with different content or refs, rejects that change's batch: record it as failed with a per-block report of its location, do not sync its specs, do not move it, and continue with the rest of the batch.
b. **Sync specs** if delta specs exist and the resolution says so: apply the delta to `aspec/specs/<capability>/spec.md` (ADDED adds; MODIFIED updates preserving unmentioned scenarios; REMOVED deletes; RENAMED renames via `FROM:`/`TO:`). Track sync.
c. **Archive**: create `aspec/changes/archive/` if missing, move to `aspec/changes/archive/YYYY-MM-DD-<name>/` without modifying the directory. If the target exists, fail that change (record the error) but continue.
d. **Track outcomes**: success, failed (with error), skipped.

### 9. Promote approved decisions per change

Apply the archive promotion gate to each change archived in phase 8:

1. With valid candidates, delegate `@memory-keeper` once in Promotion mode for that change. It writes one `recordDecision` per approved block with `content` of 1–3 sentences plus the `refs:` block.
2. If a write fails after the move, report that change as **archived, memory pending** with the `memory_key` and the reason; this is the only post-move failure mode. Never report it as memorized.

**Aggregation:** if no selected change has candidates, the batch makes **zero `@memory-keeper` delegations**. Per-change pending memory does not block the rest of the batch.

### 10. Display summary

```
## Bulk Archive Complete

Archived N changes: <change-1> -> archive/YYYY-MM-DD-<change-1>/
Skipped M: <change-2> (incomplete; user declined)
Spec sync: N delta specs synced, M conflicts resolved
**Memories promoted:** <list, or "None">
**Memory pending:** <change -> memory_key — reason, or "None">
```

## Guardrails

- Any number of changes (1+ fine, 2+ typical).
- Prompt for selection; never auto-select.
- Detect conflicts early; resolve via the codebase (chronological when both implemented).
- Skip spec sync only when implementation is missing (warn the user).
- Show per-change status before one batch confirmation.
- Track and report all outcomes (success/skip/fail).
- Archive target: current date (`YYYY-MM-DD-<name>`); if it exists, fail that change but continue others.
- Promotion per change only uses `recordDecision`; it never invents a `memory_key` and never promotes a `rule` from `## Decisiones`.
- Zero candidates across the batch ⇒ zero `@memory-keeper` delegations.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
