---
name: openspec-continue
description: Continue working on an existing change by creating its next missing artifact. Use to resume artifact creation one step at a time. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# OpenSpec Continue

Continue working on a change by creating exactly ONE next artifact. No external binaries are invoked: change state is derived by reading which artifact files exist.

**Input**: Optionally specify a change name (e.g., `add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous, list the directories under `openspec/changes/` (excluding `archive/`) and ask the user to select, marking the most recently modified one as "(Recommended)".

**IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

## Steps

### 1. Determine the next missing artifact

Read `openspec/changes/<name>/` and check for artifact files in this fixed dependency order:

1. `proposal.md` — what & why
2. `specs/` — delta requirements (at least one `spec.md` inside; skip only if the change specifies no behavior)
3. `design.md` — how
4. `tasks.md` — implementation checklist

The first item in this order that is absent (or, for `specs/`, contains no `spec.md`) is the next artifact to create.

- **If all four are present**: congratulate the user, show the status, and suggest "All artifacts created! You can now implement this change with `openspec-apply` or archive it with `openspec-archive`." STOP.
- **If the change directory does not exist**: report it and stop.

### 2. Load context files

Read every artifact that IS present — they constrain what you write next. If a `context.md` file exists in the change directory, read it as background (Work Item context: title, description, acceptance criteria). It is NOT an artifact and must NOT be copied into output files.

### 3. Create exactly ONE artifact

Draft the missing artifact using the same templates as `openspec-propose`:

- **proposal.md** (first artifact): problem statement, proposed change, scope, risks. If Work Item context is available, use its title/description as the problem statement, acceptance criteria as the requirements basis, and include a `## Related Work Item` section: `**#{id}** — {title} ({type}) · Project: {project}`.
- **specs/\<capability\>/spec.md**: one spec file per capability the change touches, with `## ADDED Requirements` / `#### Scenario:` blocks in WHEN/THEN form.
- **design.md**: approach, architecture, validation.
- **tasks.md**: phased `- [ ]` checklist.

Write the file, then verify it exists on disk.

### 4. Show progress and stop

Report:

- Which artifact was created.
- Current progress (N/4 complete).
- What is unlocked next.
- Prompt: "Run `openspec-continue` to create the next artifact."

Create ONE artifact per invocation, then STOP.

## Guardrails

- Create ONE artifact per invocation.
- Always read existing artifacts before creating the next one.
- Never skip artifacts or create out of order (proposal → specs → design → tasks).
- If context is unclear, ask the user before creating.
- Verify the artifact file exists after writing before reporting progress.
- `context.md` content informs writing but must never be copied into artifact files.
