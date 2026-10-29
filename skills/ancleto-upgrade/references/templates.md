# Templates — aspec artifacts

## proposal.md

The emitted proposal includes a `## Decisiones` section — one entry per durable decision with `memory_key`, `Elección`, `Descartado`, `Justificación`, `Refs` and `Estado`, or the single-line form `decisión | alternativa descartada | por qué | fuente/evidencia`; the full shape is defined by the Decisions section of `@spec-writer`.

```markdown
# Proposal: Migration to {LIBRARY} v{TARGET_VERSION}

## Context

{Installed version, reason, key changelog points.}

## Analysis coverage

- analyzed: {source_files_scanned} source / {test_files_scanned} tests / {config_files_scanned} config
- with/without matches: {files_with_matches}/{files_without_matches}

## Change scope

**Dependencies** — {N} in {M} package.json:

| package.json | Package | Current version | Target version |
| ------------ | ------- | --------------- | -------------- |

{One row per DEPENDENCY_CHANGES[]}

**Config files** — {N}: {change per file; if none: "None."}

**Source** — {N}: {files + breaking change; if none: "None."}

**Tests** — {N}: {files; if none: "None."}

## Breaking-change assessment

- ✅ AFFECTED — {id}: {description} — {N} occurrences in {M} files
- ✓ NOT AFFECTED — {id}: {description}

{Per relevant KNOWN_BREAK}

## Low-confidence matches

{UNSURE_MATCHES[]; if none: "None."}

## Decision

Migrate {LIBRARY} {CURRENT_VERSION} → v{TARGET_VERSION}.
Source: {DOCS_URL | "Web search: {query}" | "Internal knowledge base"}
```

---

## specs/{LIBRARY_SLUG}{TARGET_VERSION}.md

```markdown
# Specs: {LIBRARY} v{TARGET_VERSION} Migration

## ADDED Requirements

### Requirement: Dependencies

- REQ-D-{N}: The system SHALL use `{package_name}` at version `^{TARGET_VERSION}.0.0` in `{path}`

{Per DEPENDENCY_CHANGES[]}

#### Scenario: dependencies installed

- **WHEN** dependencies are installed
- **THEN** `{package_name}` resolves to `^{TARGET_VERSION}.0.0`

### Requirement: Configuration

- REQ-C-{N}: The system SHALL {required change} in `{file}`

{Per CONFIG_CHANGES[]; empty → "None."}

### Requirement: Source code

- REQ-S-{N} [{break_id}]: The system SHALL {required code change}
  Evidence: `{file}:{line_number}` ({confidence})

{Per BREAKING_CHANGES_IN_CODE[]; empty → "None."}

### Requirement: Tests

- REQ-T-{N} [{break_id}]: The system SHALL {required test change}
  Evidence: `{file}:{line_number}` ({confidence})

{Per BREAKING_CHANGES_IN_TESTS[]; empty → "None."}

### Requirement: Verification

- REQ-V-001: The project SHALL pass its declared typecheck/compile command
- REQ-V-002: The project SHALL pass all tests after the migration
- REQ-V-003: The project SHALL pass lint without errors

{Emit each REQ-V-* only when the project declares its command in `PRODUCT.md` → `## Project Commands`; skip and record the omission otherwise — never assume a runner, linter, formatter or typechecker}

### Requirement: Analysis coverage

- REQ-X-001: The analysis SHALL include every eligible source file (`.ts`, `.tsx`, `.js`) except `node_modules` and `dist`
- REQ-X-002: The analysis SHALL include every eligible test file (`*.spec.*`, `*.test.*`)
- REQ-X-003: The result SHALL report coverage metrics (`source_files_scanned`, `test_files_scanned`, `config_files_scanned`)
```

---

## tasks.md

````markdown
# Tasks: {LIBRARY} v{TARGET_VERSION} Migration

## Phase 1: Dependencies

- [ ] **T-D-{N}** Update `{package_name}` in `{path}` from `{current_version}` to `^{TARGET_VERSION}.0.0`

{Per DEPENDENCY_CHANGES[]}

- [ ] **T-D-LAST** Regenerate the lockfile:
  ```bash
  npm install
  ```

## Phase 2: Infrastructure and runtime

{IS_RUNTIME = true only; repeat per file}

- [ ] **T-I-001** {Create | Update} `.nvmrc` with value `{TARGET_VERSION}`
- [ ] **T-I-002** Update `nodeVersion` in `{CI_FILE}`: `{current}` → `{TARGET_VERSION}.x`
- [ ] **T-I-003** Update the base image in `{Dockerfile}`:
  ```dockerfile
  # Before
  FROM node:{current}-alpine
  # After
  FROM node:{TARGET_VERSION}-alpine
  ```
  _(Match the existing variant: alpine, slim, bullseye.)_
- [ ] **T-I-004** Update `Runtime` in `{appSettings.json}` to `NODEJS_{TARGET_VERSION}_X`

{IS_RUNTIME = false → _(Not applicable)_}

## Phase 3: Build and test configuration

- [ ] **T-C-{N}** {Concrete change} — `{file}`
  ```
  // Before
  {current_value}
  // After
  {target_value}
  ```

{Per CONFIG_CHANGES[]; empty → _(none detected)_}

## Phase 4: Breaking changes in source code

- [ ] **T-S-{N}** [{break_id}] `{severity}` — {description}
      Fix: {fix}
      Affected files:
  - `{file}:{line_number}` ({confidence}) — `{snippet}`

{Per BREAKING_CHANGES_IN_CODE[]; empty → _(none detected)_}

## Phase 5: Breaking changes in tests

- [ ] **T-T-{N}** [{break_id}] `{severity}` — {description}
      Fix: {fix}
      Affected files:
  - `{file}:{line_number}` ({confidence}) — `{snippet}`

{Per BREAKING_CHANGES_IN_TESTS[]; empty → _(none detected)_}

## Phase 6: Verification

> Each verification step runs the command the project declares in `PRODUCT.md` → `## Project Commands`.
> Emit a step only when the project declares its command; skip and record the omission otherwise —
> never assume a runner, linter, formatter or typechecker (Nx monorepos: only when declared, run the
> declared target).

- [ ] **T-V-001** Typecheck/compile passes (only if the project declares a typecheck command)
- [ ] **T-V-002** Build passes (only if the project declares a build command)
- [ ] **T-V-003** Lint passes (using the declared lint command)
- [ ] **T-V-004** Tests pass (using the declared test command)
- [ ] **T-V-005** CI tests pass (only if the project declares a CI test command)
- [ ] **T-V-900** Coverage: confirm file counts; classify `UNSURE_MATCHES[]`.

{Each T-V-* only when the project declares its command in `PRODUCT.md` → `## Project Commands`}

````

---

## design.md

```markdown
# Design: {LIBRARY} v{TARGET_VERSION} Migration

## Migration strategy

{Phase order + main risk/mitigation.}

## Technical decisions

### Version range — `^{TARGET_VERSION}.0.0`

Caret keeps major stability while taking patches/minors; `>=` avoided to reject the next major.

### Configuration changes

{Per CONFIG_CHANGE: technical reasoning.}

### Breaking changes — impact analysis

{Per breaking change: impact + why the fix is correct. If none: "None detected."}

### Ecosystem compatibility

{Related dependencies at risk. If none: "None identified."}

### Analysis quality

- Coverage: {source_files_scanned}/{test_files_scanned}/{config_files_scanned}
- Matches: {N} high / {N} medium / {N} low
- Low-confidence review: {criterion}

## Change table

| File | Field / Pattern | Before | After |
|------|-----------------|--------|-------|
{Per change: DEPENDENCY_CHANGES[], CONFIG_CHANGES[], BREAKING_CHANGES_IN_CODE[], BREAKING_CHANGES_IN_TESTS[]}

## References

- {DOCS_URL}
- {Additional links}
- Knowledge base: {break_ids from known-breaks.md}
```
