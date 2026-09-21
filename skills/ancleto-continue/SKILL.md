---
name: ancleto-continue
description: Continue working on an existing change by creating its next missing artifact. Use to resume artifact creation one step at a time. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Continue

**Artifacts language**: write every artifact in English. Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) are literal and MUST NOT be translated. File and directory names stay English kebab-case.

Continue a change by creating exactly ONE next artifact. No external binaries: state is derived by which artifact files exist.

**Input**: optionally a change name (e.g., `add-auth`). If omitted, try to infer it from conversation context. If vague, list the directories under `aspec/changes/` (excluding `archive/`) and ask the user to select, marking the most recently modified "(Recommended)".

**IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

## Steps

### 1. Determine the next missing artifact

Read `aspec/changes/<name>/` and check files in this fixed dependency order:

1. `proposal.md` — what & why
2. `specs/` — delta requirements (at least one `spec.md` inside; skip only if the change specifies no behavior)
3. `design.md` — how
4. `tasks.md` — implementation checklist

The first absent item (or, for `specs/`, one with no `spec.md`) is next.

- **All four present**: congratulate the user, show status, suggest "All artifacts created! You can now implement this change with `ancleto-apply` or archive it with `ancleto-archive`." STOP.
- **Change directory missing**: report it and stop.

### 2. Load context files

Read every present artifact — they constrain what you write. If `context.md` exists, read it as background (Work Item title, description, acceptance criteria); it is NOT an artifact and must NOT be copied into output files.

### 3. Create exactly ONE artifact

Draft the missing artifact using the same templates as `ancleto-propose`:

- **proposal.md** (first): problem statement, proposed change, scope, risks. With Work Item context, use its title/description as the problem statement, acceptance criteria as the requirements basis, and include `## Related Work Item`: `**#{id}** — {title} ({type}) · Project: {project}`.
- **specs/\<capability\>/spec.md**: one spec file per capability touched, with `## ADDED Requirements` / `#### Scenario:` blocks in WHEN/THEN form.
- **design.md**: approach, architecture, validation.
- **tasks.md**: phased `- [ ]` checklist.

Verify the file exists on disk.

### 4. Show progress and stop

Report which artifact was created, progress (N/4), and what is unlocked next, then: "Run `ancleto-continue` to create the next artifact." Create ONE artifact per invocation, then STOP.

## Guardrails

- Create ONE artifact per invocation, in order (proposal → specs → design → tasks); never skip.
- Read existing artifacts before creating the next.
- If context is unclear, ask before creating.
- Verify the artifact exists before reporting progress.
- `context.md` informs writing but must never be copied into artifact files.
