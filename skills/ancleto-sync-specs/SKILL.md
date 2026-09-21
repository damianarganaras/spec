---
name: ancleto-sync-specs
description: Sync delta specs from a change to main specs. Use when the user wants to update main specs with changes from a delta spec, without archiving the change.
license: MIT
compatibility: No external CLI required.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Sync

**Artifacts language**: write every artifact in English. Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) are literal and MUST NOT be translated. File and directory names stay English kebab-case.

Sync delta specs from a change to main specs.

**Agent-driven**: read delta specs and directly edit main specs, enabling intelligent merging (add one scenario without copying the whole requirement). The delta is _intent_, not a wholesale replacement — apply partial updates. Must be idempotent (running twice gives the same result).

**Input**: Optionally a change name; if omitted, infer from context. If ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   List `aspec/changes/` dirs (excluding `archive/`); ask the user to select (runtime question tool when available). Show changes that have delta specs (under `specs/`).

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Find delta specs**

   Look for `aspec/changes/<name>/specs/*/spec.md`, whose sections are:

   - `## ADDED Requirements` - New requirements to add
   - `## MODIFIED Requirements` - Changes to existing requirements
   - `## REMOVED Requirements` - Requirements to remove
   - `## RENAMED Requirements` - Requirements to rename (FROM:/TO: format)

   If none found, inform the user and stop.

3. **Apply each delta spec to main specs**

   Per capability with a delta at `aspec/changes/<name>/specs/<capability>/spec.md`:

   a. **Read the delta spec** for the intended changes

   b. **Read the main spec** at `aspec/specs/<capability>/spec.md` (may not exist yet)

   c. **Apply changes**:

   **ADDED Requirements:** absent → add; present → update to match (implicit MODIFIED).

   **MODIFIED Requirements:** find the requirement and apply — add new scenarios (don't copy existing ones), modify scenarios, or change the description. Preserve content not mentioned in the delta.

   **REMOVED Requirements:** remove the entire requirement block.

   **RENAMED Requirements:** rename the FROM requirement to TO.

   d. **Create the main spec** if the capability doesn't exist: `aspec/specs/<capability>/spec.md` with a brief Purpose (mark TBD if unknown) and the ADDED requirements.

4. **Show summary**

   Summarize capabilities updated and changes made (added/modified/removed/renamed).

**Delta Spec Format Reference**

```markdown
## ADDED Requirements

### Requirement: New Feature

The system SHALL do something new.

#### Scenario: Basic case

- **WHEN** user does X
- **THEN** system does Y

## MODIFIED Requirements

### Requirement: Existing Feature

#### Scenario: New scenario to add

- **WHEN** user does A
- **THEN** system does B

## REMOVED Requirements

### Requirement: Deprecated Feature

## RENAMED Requirements

- FROM: `### Requirement: Old Name`
- TO: `### Requirement: New Name`
```

**Output On Success**

```
## Specs Synced: <change-name>

Updated main specs:
- **<capability-1>**: added "New Feature"; modified "Existing Feature" (1 scenario)
- **<capability-2>**: created new spec file; added "Another Feature"

The change remains active - archive when implementation is complete.
```

**Guardrails**

- Read both delta and main specs before editing
- Preserve content not mentioned in the delta
- If unclear, ask for clarification
- Show changes as you go
- Idempotent - running twice gives the same result
