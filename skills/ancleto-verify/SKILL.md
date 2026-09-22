---
name: ancleto-verify
description: Verify an implementation against its change artifacts (completeness, correctness, coherence). Use before archiving a change. Captures architectural findings into persistent memory. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Verify

Verify an implementation against its change artifacts. No external binaries.

**Input**: Optionally a change name (e.g., `add-auth`); if omitted, infer from context. If ambiguous, list `aspec/changes/` dirs containing `tasks.md` and ask the user to select. Mark incomplete-task changes "(In Progress)".

**IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

## Steps

### 1. Load change artifacts

Read under `aspec/changes/<name>/`: `tasks.md` (required), plus `proposal.md`, `design.md`, `specs/` when present.

### 2. Completeness

**Tasks:** parse checkboxes (`- [ ]` incomplete vs `- [x]` complete) and count. Each incomplete → CRITICAL: "Complete task: `<description>`" or "Mark as done if already implemented".

**Spec coverage:** for each `### Requirement:` in `specs/`, search the codebase for related keywords. Unimplemented → CRITICAL: "Requirement not found: `<requirement name>`" + "Implement requirement: `<description>`".

### 3. Correctness

**Mapping:** for each requirement, find implementation evidence; note file paths and lines. Divergence → WARNING: "Implementation may diverge from spec: `<details>`" + "Review `<file>:<lines>` against requirement X".

**Scenarios:** for each `#### Scenario:`, check the code handles the conditions and tests cover it. Uncovered → WARNING: "Scenario not covered: `<scenario name>`" + "Add test or implementation for scenario: `<description>`".

### 4. Coherence

**Design:** if `design.md` exists, extract key decisions ("Decision:", "Approach:", "Architecture:") and verify adherence. Contradiction → WARNING: "Design decision not followed: `<decision>`" + "Update implementation or revise design.md". If absent, note "No design.md to verify against".

**Patterns:** review new code against project patterns (naming, dirs, style). Significant deviation → SUGGESTION: "Code pattern deviation: `<details>`" + "Consider following project pattern: `<example>`".

### 5. Capture findings into persistent memory

For every WARNING/CRITICAL revealing an architectural decision, standing rule, or reusable lesson:

- Standing rules/constraints/conventions → `recordRule`:
  ```
  recordRule({ memory_key: "<kebab-topic>", content: "<the rule>", justification: "<evidence>" })
  ```
- Design decisions/trade-offs and why → `recordDecision`:
  ```
  recordDecision({ memory_key: "<kebab-topic>", content: "<the decision>", justification: "<reason>" })
  ```

Record only what saves future investigation, not the outcome. If nothing meets the bar, record nothing and say so.

### 6. Verification Report

```
## Verification Report: <change-name>

### Summary
| Dimension    | Status           |
|--------------|------------------|
| Completeness | X/Y tasks, N reqs|
| Correctness  | M/N reqs covered |
| Coherence    | Followed/Issues  |
```

**Issues by priority**, each with a specific recommendation:

1. **CRITICAL** (block archive): incomplete tasks, missing requirement implementations.
2. **WARNING** (should fix): spec/design divergences, missing scenario coverage.
3. **SUGGESTION** (nice to fix): pattern inconsistencies, minor improvements.

**Assessment:** CRITICAL → "X critical issue(s) found. Fix before archiving."; warnings only → "No critical issues. Y warning(s) to consider. Ready for archive (with noted improvements)."; clean → "All checks passed. Ready for archive." Note memories recorded in step 5 (or "No findings recorded").

## Heuristics

- **Completeness**: objective checklist items only.
- **Correctness**: keyword search, path analysis, inference — no certainty required.
- **Coherence**: glaring inconsistencies only; don't nitpick style.
- **False positives**: when uncertain, prefer SUGGESTION > WARNING > CRITICAL.
- **Actionability**: every issue carries a specific recommendation with file/line refs.

## Graceful Degradation

- Only `tasks.md` → task completion, skip spec/design.
- Tasks + specs → completeness + correctness, skip design.
- Full artifacts → all three dimensions.
- Always note skipped checks and why.

## Guardrails

- Reference code as `file.ts:123`.
- No vague suggestions ("consider reviewing") — every issue needs a specific recommendation.
- `recordRule`/`recordDecision` accept only `memory_key`, `content`, `justification`, `scope`. Never send `source`, `confidence`, `status` or `id` — the runtime manages those.
