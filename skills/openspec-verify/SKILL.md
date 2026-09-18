---
name: openspec-verify
description: Verify an implementation against its change artifacts (completeness, correctness, coherence). Use before archiving a change. Captures architectural findings into persistent memory. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# OpenSpec Verify

Verify that an implementation matches its change artifacts (proposal, design, tasks, delta specs) by reading the files directly. No external binaries are invoked.

**Input**: Optionally specify a change name (e.g., `add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous, list the directories under `openspec/changes/` that contain a `tasks.md` file and ask the user to select. Mark changes with incomplete tasks as "(In Progress)".

**IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

## Steps

### 1. Load the change artifacts

Read everything under `openspec/changes/<name>/`:

- `tasks.md` — the checklist (required)
- `proposal.md`, `design.md` — intent and decisions (if present)
- `specs/` — delta requirements (if present)

### 2. Verify Completeness

**Task Completion:**

- Parse checkboxes in `tasks.md`: `- [ ]` (incomplete) vs `- [x]` (complete).
- Count complete vs total tasks.
- For each incomplete task, add a CRITICAL issue: "Complete task: `<description>`" or "Mark as done if already implemented".

**Spec Coverage:**

- If delta specs exist in `openspec/changes/<name>/specs/`:
  - Extract all requirements (marked with `### Requirement:`).
  - For each requirement, search the codebase for keywords related to it and assess whether implementation likely exists.
  - If a requirement appears unimplemented, add a CRITICAL issue: "Requirement not found: `<requirement name>`" with the recommendation "Implement requirement: `<description>`".

### 3. Verify Correctness

**Requirement Implementation Mapping:**

- For each requirement from delta specs, search the codebase for implementation evidence.
- If found, note file paths and line ranges.
- If divergence is detected, add a WARNING: "Implementation may diverge from spec: `<details>`" with "Review `<file>:<lines>` against requirement X".

**Scenario Coverage:**

- For each scenario in delta specs (marked with `#### Scenario:`), check whether conditions are handled in code and whether tests cover the scenario.
- If a scenario appears uncovered, add a WARNING: "Scenario not covered: `<scenario name>`" with "Add test or implementation for scenario: `<description>`".

### 4. Verify Coherence

**Design Adherence:**

- If `design.md` exists, extract key decisions (sections like "Decision:", "Approach:", "Architecture:") and verify the implementation follows them.
- If a contradiction is detected, add a WARNING: "Design decision not followed: `<decision>`" with "Update implementation or revise design.md to match reality".
- If no `design.md` exists, skip this check and note "No design.md to verify against".

**Code Pattern Consistency:**

- Review new code for consistency with project patterns (file naming, directory structure, coding style).
- Significant deviations get a SUGGESTION: "Code pattern deviation: `<details>`" with "Consider following project pattern: `<example>`".

### 5. Capture findings into persistent memory

For every WARNING or CRITICAL issue that reveals an architectural decision, a standing rule, or a reusable lesson, record it with the memory tools:

- Standing rules, constraints, or conventions the team must keep following → `recordRule`, e.g.:
  ```
  recordRule({ memory_key: "<kebab-topic>", content: "<the rule>", justification: "<evidence>" })
  ```
- Design decisions, trade-offs, and why one path was taken → `recordDecision`, e.g.:
  ```
  recordDecision({ memory_key: "<kebab-topic>", content: "<the decision>", justification: "<reason>" })
  ```

Record only findings that would save future investigation. Do not record the verification outcome itself. If no finding meets the bar, record nothing and say so.

### 6. Generate the Verification Report

**Summary Scorecard:**

```
## Verification Report: <change-name>

### Summary
| Dimension    | Status           |
|--------------|------------------|
| Completeness | X/Y tasks, N reqs|
| Correctness  | M/N reqs covered |
| Coherence    | Followed/Issues  |
```

**Issues by Priority:**

1. **CRITICAL** (must fix before archive): incomplete tasks, missing requirement implementations — each with a specific, actionable recommendation.
2. **WARNING** (should fix): spec/design divergences, missing scenario coverage — each with a specific recommendation.
3. **SUGGESTION** (nice to fix): pattern inconsistencies, minor improvements.

**Final Assessment:**

- If CRITICAL issues: "X critical issue(s) found. Fix before archiving."
- If only warnings: "No critical issues. Y warning(s) to consider. Ready for archive (with noted improvements)."
- If all clear: "All checks passed. Ready for archive."
- Plus a line listing which memories were recorded in step 5 (or "No findings recorded").

## Verification Heuristics

- **Completeness**: focus on objective checklist items (checkboxes, requirements list).
- **Correctness**: use keyword search, file path analysis, reasonable inference — don't require perfect certainty.
- **Coherence**: look for glaring inconsistencies, don't nitpick style.
- **False Positives**: when uncertain, prefer SUGGESTION over WARNING, WARNING over CRITICAL.
- **Actionability**: every issue must have a specific recommendation with file/line references where applicable.

## Graceful Degradation

- If only `tasks.md` exists: verify task completion only, skip spec/design checks.
- If tasks + specs exist: verify completeness and correctness, skip design.
- If full artifacts: verify all three dimensions.
- Always note which checks were skipped and why.

## Guardrails

- Use code references in format `file.ts:123`.
- No vague suggestions like "consider reviewing" — every issue needs a specific recommendation.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
