---
name: ancleto-update
description: Update the artifacts of an existing change when a definition changed (a main spec, the scope, or a design decision). Merges in place or writes a rev2, preserving unmentioned content. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Update

**Artifacts language**: write artifact content in the user's conversation language (or the project's configured `language` in `.ancletorc`). Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) and file/directory names are literal and MUST NOT be translated.

Update the artifacts of an existing change when a definition changed. This skill edits the change's own artifacts with a non-destructive merge; it does not implement code.

**Name disambiguation**: this skill (`ancleto-update`, command `/cleto-update`) updates change artifacts. It is NOT the CLI `ancleto update`, which reinstalls the package over an existing install. Never confuse the two.

**Input**: a change name (e.g., `add-auth`) and what changed — either a definition the user describes, or a spec that already changed. If the change name is omitted, infer it from conversation context; if vague or ambiguous you MUST list the directories under `aspec/changes/` (excluding `archive/`) and ask the user to select.

**IMPORTANT**: Do NOT guess or auto-select a change. If the name resolves inside `aspec/changes/archive/`, STOP and report it — never edit an archived change.

## Steps

### 1. Select the change

- A name is provided → use it.
- Omitted → infer from context. If ambiguous, list `aspec/changes/` (excluding `archive/`) and ask.
- If it resolves to `aspec/changes/archive/<name>/`, report and stop.

### 2. Read the artifacts

Read every present artifact — they constrain what you write:

- `proposal.md` — what & why
- `specs/<capability>/spec.md` — delta requirements
- `design.md` — how
- `tasks.md` — implementation checklist

If `context.md` exists, read it as background (Work Item title, description, acceptance criteria); it is NOT an artifact and MUST NOT be copied into output.

### 3. Consolidate what changed

Two sources, and they are **additive** (neither replaces the other):

- **Drift (delta ↔ main)**: for each delta spec at `aspec/changes/<name>/specs/<capability>/spec.md`, compare against the main spec at `aspec/specs/<capability>/spec.md`. Report requirements present in the delta but absent or changed in the main spec (and vice versa).
- **User-described change**: the definition change the user states.

If neither source yields anything actionable, report and stop.

### 4. Classify by owner and apply a non-destructive merge

Each change has exactly one owning artifact:

| What changed | Owning artifact |
|---|---|
| Requirement / specified behavior | `specs/<capability>/spec.md` (`## MODIFIED Requirements`) |
| Design decision | `design.md` |
| Scope | `proposal.md` |
| New work | `tasks.md` |

Apply the **minimal** edit to each owning artifact and **preserve everything not mentioned**:

- **specs/**: use `## MODIFIED Requirements`, adding or editing scenarios only. Do NOT copy existing scenarios; preserve requirements the delta does not mention.
- **tasks.md**: add new tasks at the end of their phase; preserve `- [x]` marks; do NOT reorder existing tasks.
- **proposal.md / design.md**: edit the affected section; leave the rest intact.

The merge MUST be idempotent: running twice with the same change yields the same result.

### 5. Choose the write mode (ask the user)

Ask the user which write mode to use, and do NOT pick one yourself:

- **in-place**: edit the owning artifact in place, then append an entry recording the applied change to a `## Change Log` section in `proposal.md` (create the section if missing).
- **rev2**: write only the affected artifacts under `aspec/changes/<name>/rev2/`, mirroring their relative paths (`rev2/proposal.md`, `rev2/specs/<capability>/spec.md`, …), leaving the originals untouched; also write `rev2/README.md` with the reason, the date, and the source of the change.

### 6. Report and offer verify

Summarize the artifacts updated and the drift resolved. If the change altered specified behavior, offer `ancleto-verify`.

## Guardrails

- **Merge, not overwrite**: preserve all content the change does not mention; be idempotent.
- **Scope**: only the change's own artifacts. NEVER edit `aspec/changes/archive/`, the main specs under `aspec/specs/` (that is `ancleto-sync-specs`), or implementation code (that is `ancleto-apply`).
- **Ask, don't guess**: if the change, the owning artifact, or the write mode is unclear, ask.
- **Never auto-select** the change; exclude `archive/` from the candidate list.
- Never conflate this skill with the CLI `ancleto update`.
