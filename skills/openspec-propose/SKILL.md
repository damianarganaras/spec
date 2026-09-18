---
name: openspec-propose
description: Draft all artifacts for a change in one step (proposal, design, tasks, delta specs). Use after openspec-new, or directly with a change name or description. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# OpenSpec Propose

Create a change and generate all its artifacts in one step, writing files directly. No external binaries are invoked.

**Input**: The argument is the change name (kebab-case), OR a description of what the user wants to build.

## Steps

### 1. Resolve context and derive the change name

Same as `openspec-new` step 1: use in-session Work Item context if available (record id/title/project for traceability, skip entirely when Azure DevOps is not configured), otherwise ask what the user wants to build and derive a kebab-case name.

**IMPORTANT**: Do NOT proceed without a change name. If a change with that name already exists, ask whether to continue it or create a new one.

### 2. Recall prior memory

Call the memory tool once with a semantic query describing what the change will do:

```
searchMemory({ query })
```

Use what comes back as read-only background while drafting. If nothing is returned, or the tool is unavailable, continue silently without blocking.

### 3. Create the change directory

Create `openspec/changes/<name>/` directly if it does not exist yet.

### 4. Create artifacts in dependency order

Write each artifact file directly, in this order. Read each completed artifact before drafting the next one so they stay consistent.

**4a. `proposal.md`** — what & why:

```markdown
# Proposal: <title>

## Problem
<what is wrong or missing, and for whom>

## Proposed change
<what will change>

## Scope
- In scope: ...
- Out of scope: ...

## Risks
- <risk>: <mitigation>
```

**4b. `design.md`** — how:

```markdown
# Design: <title>

## Approach
<chosen approach and why it was preferred over alternatives>

## Architecture
<components touched, data flow, key interfaces>

## Validation
<how the change will be verified: tests, checks, manual steps>
```

**4c. `tasks.md`** — phased implementation checklist:

```markdown
# Tasks: <title>

- [ ] Task 1 — <description>
- [ ] Task 2 — <description>
```

Break work into small, independently verifiable tasks. Mark each with `- [ ]` (unchecked).

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

### 5. Verify each file exists before proceeding to the next

After writing an artifact, confirm the file is on disk, then continue.

## Output

After completing all artifacts, summarize:

- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `openspec-apply` to start implementing."

## Artifact Creation Guidelines

- Read dependency artifacts for context before creating new ones
- Keep each artifact focused on its own concern (what / how / steps / requirements)
- If context is critically unclear, ask the user — but prefer making reasonable decisions to keep momentum

## Guardrails

- Create ALL artifacts needed for implementation (proposal, design, tasks; specs only when behavior is specified)
- Always read dependency artifacts before creating a new one
- If a change with that name already exists, ask whether to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to the next
- Memory recall never blocks artifact creation
