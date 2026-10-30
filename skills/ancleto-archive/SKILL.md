---
name: ancleto-archive
description: Archive a completed change, syncing delta specs first when needed. Use when implementation and verification are done. Promotes approved decisions into persistent memory. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Archive

**Artifacts language**: follow the `LOCKED: artifacts-language` block in `AGENTS.md` (single source of truth for artifact language and literal keywords).

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

**Canonical keywords first:** when delta specs exist and the CLI is available, run `ancleto specs check --change <name> --json`. If a delta spec or its target source-of-truth spec is non-canonical (translated keywords), warn that requirement blocks cannot be matched reliably and ask whether to normalize the affected spec first or archive without syncing that capability. Never merge into a non-canonical spec silently.

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

Follow the `LOCKED: seed-freshness` block in `AGENTS.md` (single source of truth for this rule). If the `ancleto` CLI is available in this project, run `ancleto discovery --check` (read-only) and read its JSON `state` and `impact` to apply that rule; if the CLI is unavailable, skip this step.

### 4. Preflight the promotion batch

Run this while the change is still in place, before moving anything. The shape of `## Decisiones` is defined in `agents/spec-writer.md`; reference it, do not restate it here.

1. Read `proposal.md` and collect the blocks under `## Decisiones`.
2. A candidate is a block with **its own `memory_key` and `Estado: aprobado`**. A one-line decision is never a candidate: it has no `memory_key` and no `Estado`. Promote only `decision`; a block classified as a permanent rule is not promoted from here.
3. **Preflight the whole batch before the first write:** own keys, keys unique within the batch, `Estado: aprobado`, refs present and resolvable, no `path:` that points inside `aspec/changes/<change-name>/` (it resolves now but stops resolving once the change is moved to `archive/`), and no session candidate (transcript, task state, session summary). Any violation ⇒ **zero writes**, a per-block report with its location in `proposal.md`, and **the change is not moved**; fix it and re-run the archive. If two blocks share a `memory_key` and differ in content or refs, reject the whole batch and report both.
4. **Zero candidates ⇒ zero memory writes and zero `@memory-keeper` delegations.** Do not ask the memory agent whether there is anything to store.

### 5. Perform the archive

Create `aspec/changes/archive/` if absent. Target: `YYYY-MM-DD-<change-name>` (current date).

- **Target exists**: fail, suggesting a rename or different date.
- **Otherwise**: move the change directory to `aspec/changes/archive/YYYY-MM-DD-<name>/` without modifying it.

### 6. Promote approved decisions into persistent memory

1. With valid candidates, delegate `@memory-keeper` **once** in Promotion mode with the change slug and the approved blocks verbatim. It writes one `recordDecision` per approved block with `content` of 1–3 sentences plus the `refs:` block, and reports per key.
2. If a write fails after the change was moved, report **archived, memory pending**, naming the `memory_key` and the reason, with a retry instruction. Never report "archived and memorized" when only the archive happened.

### 7. Display summary

```
## Archive Complete

**Change:** <change-name>
**Archived to:** aspec/changes/archive/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced (or: No delta specs / Sync skipped)
**Memories promoted:** <list, or "None">
```

If a promotion failed after the move, add `**Memory pending:** <memory_key> — <reason> (retry required)`. Never label the archive as memorized when a write is pending.

When the seed was `STALE`, add a `**Seed:**` line: `Regenerated` or `Stale — regeneration declined`.

If warnings applied (incomplete tasks, skipped sync, stale seed), show an "Archive Complete (with warnings)" variant listing them.

## Guardrails

- Always prompt for change selection if not provided.
- Don't block archiving on warnings — inform and confirm.
- Seed freshness follows the `LOCKED: seed-freshness` rule in `AGENTS.md`.
- If the target archive directory exists, fail instead of overwriting.
- Move the change directory without modifying it; never delete files inside it before or after the move.
- Promotion only uses `recordDecision`; it never invents a `memory_key`, never derives one from the change, and never promotes a `rule` from `## Decisiones`.
- Zero candidates ⇒ zero writes and zero `@memory-keeper` spawn.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
