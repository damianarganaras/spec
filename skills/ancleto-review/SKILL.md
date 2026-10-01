---
name: ancleto-review
description: Review user-scoped code for duplication, redundancy, misplacement and dead code. Reports findings with file:line refs without modifying code. No external binaries required.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Review

Review code quality inside a user-declared scope. Read-only: never write or edit code.

**Input**: the scope to review — free text after `/cleto-review`. Forms (first match wins): `#<n>` (commits whose message contains `#<n>`), an explicit git range (`A..B`, `HEAD~n`), existing paths/directories, or empty (infer from context). If ambiguous, list candidate scopes and ask. Never guess.

**IMPORTANT**: Do NOT guess or auto-select a scope when ambiguous. Always let the user choose. Work Item grounding (when the request references a Work Item) is owned by `@context-resolver` — treat a resolved item as `#<n>`.

## Steps

### 1. Resolve the scope

- `#<n>` → `git log --grep="#<n>" --format=%H`, then the diff of each commit (`H^ H`). Only code introduced there is in scope.
- Range (`A..B`, `HEAD~n`) → `git diff` of that range.
- Paths → worktree diff filtered to those paths.
- Nothing usable → list `aspec/changes/` dirs with `tasks.md` and recent `git log` subjects as candidates, and ask.

The result is a concrete file:line list. Report ONLY on that list.

### 2. Collect evidence (reading outside the scope is allowed)

Read outside the diff solely as comparison evidence: twin definitions (redundancy), call/import references (dead code), and the project map (`PRODUCT.md`, directory structure, `aspec/specs/`) for placement. Never report findings outside the scope.

### 3. Run the four detectors

**Duplicated code:** twin blocks inside the scope doing the same logic → CRITICAL: "Duplicated block: `<file:line>` and `<file:line>`" + "Extract to a shared helper".

**Redundant method:** scope logic already implemented outside the diff → WARNING: "Redundant with `<external-file:line>`" + "Reuse `<name>` instead of duplicating". If the difference is subtle or uncertain, downgrade to SUGGESTION.

**Misplaced code:** scope code contradicting the project map (e.g. business logic in a handler, stray util in a component) → WARNING or SUGGESTION: "Misplaced code: `<file:line>` belongs in `<location>`" + reason. When the architecture is unclear, prefer SUGGESTION.

**Dead code:** scope functions/imports with no references in the repo (search calls and imports) → CRITICAL when proven (no references at all): "Unused code: `<file:line>`" + "Remove it". Otherwise SUGGESTION.

### 4. Review Report

```
## Review: <scope description>

### CRITICAL
- ...

### WARNING
- ...

### SUGGESTION
- ...
```

**Issues by priority**, each with a specific recommendation:

1. **CRITICAL** (proven duplication or proven dead code inside the scope).
2. **WARNING** (likely redundancy or misplacement, evidence cited).
3. **SUGGESTION** (uncertain or stylistic, needs human judgment).

**Assessment:** CRITICAL → "X critical issue(s) found. Fix before merging."; warnings only → "No critical issues. Y warning(s) to consider."; clean → "No issues found in scope: `<scope>`."

## Heuristics

- **Scope discipline**: every finding must point at a file:line inside the scope; external files appear only as evidence.
- **False positives**: when uncertain, prefer SUGGESTION > WARNING > CRITICAL.
- **Actionability**: every issue carries a specific recommendation with file/line refs.

## Guardrails

- Read-only: never write, edit, or refactor code — only report.
- Reference code as `file.ts:123`.
- No vague suggestions ("consider reviewing") — every issue needs a specific recommendation.
- Never paste diffs or code blocks — cite locations.
- At most 5 findings per severity; if more exist, keep the 5 highest-impact and state the count of the rest.
- This skill does not verify artifacts (that is `ancleto-verify`), conventions against an approved request (that is `reviewer`), or vulnerabilities (that is `ancleto-security`).
