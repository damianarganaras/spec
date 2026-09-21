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

Fast-forward through artifact creation: generate everything needed to start implementation, writing files directly. No external binaries are invoked.

**Input**: The argument is the change name (kebab-case), OR a description of what the user wants to build.

## Steps

### 1. Resolve context and derive the change name

- If Work Item context was already provided in this session, use it (record id/title/project for traceability). Skip Work Item handling entirely when Azure DevOps is not configured.
- If no change name was provided, ask what the user wants to build:
  > "What change do you want to work on? Describe what you want to build or fix."
- Derive a kebab-case name from the description.

**IMPORTANT**: Do NOT proceed without a change name. If a change with that name already exists, ask whether to continue it or create a new one.

### 2. Recall prior memory

Call the memory tool once with a semantic query describing what the change will do:

```
searchMemory({ query })
```

Use what comes back as read-only background while drafting. If nothing is returned, continue silently.

### 3. Create the change directory

Create `aspec/changes/<name>/` directly.

### 4. Create all artifacts in dependency order

Write each file directly, reading completed ones for context before drafting the next:

1. **`proposal.md`** — problem, proposed change, scope, risks. If Work Item context is available, use its title/description as the problem statement, acceptance criteria as the requirements basis, and include a `## Related Work Item` section: `**#{id}** — {title} ({type}) · Project: {project}`.
2. **`specs/<capability>/spec.md`** — one spec file per capability the change touches, with `## ADDED Requirements` / `#### Scenario:` blocks in WHEN/THEN form. Skip only when the change specifies no behavior, and say why.
3. **`design.md`** — approach, architecture, validation.
4. **`tasks.md`** — phased `- [ ]` checklist of small, independently verifiable tasks.

Verify each file exists on disk before moving to the next. If an artifact needs user input (unclear context), ask with the **AskUserQuestion tool** and continue.

### 5. Show final status

Summarize:

- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `ancleto-apply` to start implementing."

## Artifact Creation Guidelines

- Read dependency artifacts for context before creating new ones.
- Use the fixed templates above as structure — fill in their sections.
- Keep each artifact focused on its own concern (what / how / steps / requirements).
- **IMPORTANT**: project background and constraints guide what you write but must never appear as blocks in the output files.

## Guardrails

- Create ALL artifacts needed for implementation in this single run (proposal, specs, design, tasks).
- Always read dependency artifacts before creating a new one.
- If context is critically unclear, ask the user — but prefer making reasonable decisions to keep momentum.
- If a change with that name already exists, ask whether to continue it or create a new one.
- Verify each artifact file exists after writing before proceeding to the next.
- Memory recall never blocks artifact creation.
