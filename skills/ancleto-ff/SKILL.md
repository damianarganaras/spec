---
name: ancleto-ff
description: Fast-forward artifact creation — create a change and generate everything needed for implementation in one go. Use when the path is clear and no step-by-step guidance is wanted. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec FF

**Artifacts language**: write artifact content in the user's conversation language (or the project's configured `language` in `.ancletorc`). Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) and file/directory names are literal and MUST NOT be translated.

Fast-forward artifact creation: generate everything needed to start implementation, writing files directly. No external binaries.

**Input**: the change name (kebab-case), or a description of what to build.

## Steps

### 1. Resolve context and derive the change name

- If Work Item context was provided this session, use it (record id/title/project). Skip Work Item handling when Azure DevOps is unconfigured.
- If no name was provided, ask:
  > "What change do you want to work on? Describe what you want to build or fix."
- Derive a kebab-case name.

**IMPORTANT**: Do NOT proceed without a change name.

### 2. Recall prior memory

Call the memory tool once with a semantic query describing the change:

```
searchMemory({ query })
```

Use the result as read-only background; if empty, continue silently.

### 3. Create the change directory

Create `aspec/changes/<name>/` directly.

### 4. Create all artifacts in dependency order

Write each file directly, reading completed ones first:

1. **`proposal.md`** — problem, proposed change, scope, risks. With Work Item context, use its title/description as the problem statement, acceptance criteria as the requirements basis, and include `## Related Work Item`: `**#{id}** — {title} ({type}) · Project: {project}`.
2. **`specs/<capability>/spec.md`** — one file per capability touched, with `## ADDED Requirements` / `#### Scenario:` blocks in WHEN/THEN form. Skip only when the change specifies no behavior, and say why.
3. **`design.md`** — approach, architecture, validation.
4. **`tasks.md`** — phased `- [ ]` checklist of small, independently verifiable tasks.

Verify each file exists before moving on. If an artifact needs user input, ask (use the runtime question tool when available) and continue.

### 5. Show final status

Report change name/location and artifacts created, then: "All artifacts created! Ready for implementation. Run `ancleto-apply`."

## Guardrails

- Create ALL artifacts needed for implementation in this single run (proposal, specs, design, tasks).
- Read dependency artifacts before creating the next one.
- Use the fixed templates above as structure; keep each artifact focused on its own concern (what / how / steps / requirements).
- **IMPORTANT**: project background and constraints guide what you write but must never appear as blocks in the output files.
- If context is critically unclear, ask the user — but prefer reasonable decisions to keep momentum.
- If a change with that name already exists, ask whether to continue it or create a new one.
- Verify each artifact file exists after writing before proceeding.
- Memory recall never blocks artifact creation.
