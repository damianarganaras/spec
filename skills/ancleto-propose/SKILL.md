---
name: ancleto-propose
description: Draft all artifacts for a change in one step (proposal, design, tasks, delta specs). Use after ancleto-new, or directly with a change name or description. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Propose

**Artifacts language**: write artifact content in the user's conversation language (or the project's configured `language` in `.ancletorc`). Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) and file/directory names are literal and MUST NOT be translated.

Create a change and all its artifacts in one step, writing files directly. No external binaries.

**Input**: the change name (kebab-case), or a description of what to build.

## Steps

### 1. Resolve context and derive the change name

Same as `ancleto-new` step 1: use in-session Work Item context if available (record id/title/project; skip when Azure DevOps is unconfigured), else ask what to build and derive a kebab-case name.

**IMPORTANT**: Do NOT proceed without a change name.

### 2. Recall prior memory

Call the memory tool once with a semantic query describing the change:

```
searchMemory({ query })
```

Use the result as read-only background; if empty or unavailable, continue silently without blocking.

### 3. Create the change directory

Create `aspec/changes/<name>/` if missing.

### 4. Create artifacts in dependency order

Write each directly, reading each completed one before drafting the next.

**4a. `proposal.md`** — what & why: `# Proposal: <title>`, then `## Problem`, `## Proposed change`, `## Scope` (In/Out of scope), `## Risks` (`<risk>: <mitigation>`).

**4b. `design.md`** — how: `# Design: <title>`, then `## Approach`, `## Architecture`, `## Validation`.

**4c. `tasks.md`** — phased `- [ ]` checklist of small, independently verifiable tasks: `# Tasks: <title>`.

**4d. `specs/<capability>/spec.md`** — delta requirements (only when the change alters specified behavior):

```markdown
## ADDED Requirements

### Requirement: <name>

The system SHALL <behavior>.

#### Scenario: <name>

- **WHEN** <condition>
- **THEN** <expected outcome>

## MODIFIED Requirements

### Requirement: <name>

#### Scenario: <new or changed scenario>

- **WHEN** <condition>
- **THEN** <expected outcome>
```

If the change adds no specified behavior, skip `specs/` and note why.

### 5. Verify each file exists before proceeding

Confirm each artifact is on disk after writing.

## Output

Report name/location and artifacts created, then: "All artifacts created! Ready for implementation. Run `ancleto-apply`."

## Guardrails

- Create ALL artifacts needed for implementation (proposal, design, tasks; specs only when behavior is specified).
- Read dependency artifacts before creating the next one.
- If a change with that name already exists, ask whether to continue it or create a new one.
- Verify each artifact file exists after writing before proceeding.
- Keep each artifact focused on its own concern (what / how / steps / requirements); if context is unclear, ask — but prefer momentum.
- Memory recall never blocks artifact creation.
