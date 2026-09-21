# Templates — aspec artifacts

Exact templates for the four generated artifacts; fill each `{...}` placeholder.

---

## proposal.md

```markdown
# Proposal: Migration to {LIBRARY} v{TARGET_VERSION}

## Context

{Installed version + migration reason (EOL, perf, compatibility, features); key changelog
points if docs exist.}

## Analysis coverage

- source files analyzed: {source_files_scanned}
- test files analyzed: {test_files_scanned}
- config files analyzed: {config_files_scanned}
- files with matches: {files_with_matches}
- files without matches: {files_without_matches}

## Change scope

### Affected dependencies — {N} packages in {M} package.json

| package.json | Package | Current version | Target version |
| ------------ | ------- | --------------- | -------------- |

{One row per DEPENDENCY_CHANGES[]}

### Config files to modify — {N} files

{Change per file; if none: "None."}

### Source code with breaking changes — {N} files

{Affected files + breaking change; if none: "None."}

### Tests with breaking changes — {N} files

{Affected test files; if none: "None."}

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

- **WHEN** dependencies are installed for the affected package
- **THEN** `{package_name}` resolves to `^{TARGET_VERSION}.0.0`

### Requirement: Configuration

- REQ-C-{N}: The system SHALL {required change} in `{file}`

{Per CONFIG_CHANGES[]; empty → "No configuration requirements."}

### Requirement: Source code

- REQ-S-{N} [{break_id}]: The system SHALL {required code change}
  Evidence: `{file}:{line_number}` ({confidence})

{Per BREAKING_CHANGES_IN_CODE[]; empty → "No source-code requirements."}

### Requirement: Tests

- REQ-T-{N} [{break_id}]: The system SHALL {required test change}
  Evidence: `{file}:{line_number}` ({confidence})

{Per BREAKING_CHANGES_IN_TESTS[]; empty → "No test requirements."}

### Requirement: Verification

- REQ-V-001: The project SHALL compile without TypeScript errors
- REQ-V-002: The project SHALL pass all tests after the migration
- REQ-V-003: The project SHALL pass lint without errors

{REQ-V-003 only if the lint script exists}

### Requirement: Analysis coverage

- REQ-X-001: The analysis SHALL include every eligible source file (`.ts`, `.tsx`, `.js`), excluding `node_modules`, `dist` and generated artifacts
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
````

## Phase 2: Infrastructure and runtime

{Only if IS_RUNTIME = true; one T-I task per file found}

- [ ] **T-I-001** {Create | Update} `.nvmrc` with value `{TARGET_VERSION}`

- [ ] **T-I-002** Update `nodeVersion` in `{CI_FILE}` from `{current}` to `{TARGET_VERSION}.x`

- [ ] **T-I-003** Update the base image in `{Dockerfile}`:
  ```dockerfile
  # Before
  FROM node:{current}-alpine
  # After
  FROM node:{TARGET_VERSION}-alpine
  ```
  _(Match the existing variant: alpine, slim, bullseye, etc.)_

- [ ] **T-I-004** Update `Runtime` in `{appSettings.json}` to `NODEJS_{TARGET_VERSION}_X`

{If IS_RUNTIME = false:}
_(Not applicable to library migrations)_

## Phase 3: Build and test configuration

- [ ] **T-C-{N}** {Concrete change description}
      File: `{file}`
  ```
  // Before
  {current_value}
  // After
  {target_value}
  ```

{Per CONFIG_CHANGES[]; empty →}
_(No configuration changes detected)_

## Phase 4: Breaking changes in source code

- [ ] **T-S-{N}** [{break_id}] `{severity}` — {description}
      Fix: {fix}
      Affected files:
  - `{file}:{line_number}` ({confidence}) — `{snippet}`

{Per BREAKING_CHANGES_IN_CODE[], one sub-bullet per file; empty →}
_(No breaking changes detected in source code for this migration)_

## Phase 5: Breaking changes in tests

- [ ] **T-T-{N}** [{break_id}] `{severity}` — {description}
      Fix: {fix}
      Affected files:
  - `{file}:{line_number}` ({confidence}) — `{snippet}`

{Per BREAKING_CHANGES_IN_TESTS[], one sub-bullet per file; empty →}
_(No breaking changes detected in tests for this migration)_

## Phase 6: Verification

- [ ] **T-V-001** Verify TypeScript compilation:
  ```bash
  npx tsc --noEmit
  # Nx monorepos: npx nx affected --target=typecheck
  ```

- [ ] **T-V-002** Verify build:
  ```bash
  npm run build
  # Nx monorepos: npx nx affected --target=build
  ```

- [ ] **T-V-003** Run the linter:
  ```bash
  npm run lint
  # Nx monorepos: npx nx affected:lint
  ```

- [ ] **T-V-004** Run the test suite:
  ```bash
  npm test
  # Nx monorepos: npx nx affected --target=test
  ```

- [ ] **T-V-005** Run tests in CI mode:

  ```bash
  npm run test:ci
  ```

- [ ] **T-V-900** Validate scan coverage:
  - confirm scanned file counts (source/tests/config)
  - review `UNSURE_MATCHES[]` and classify each case

{T-V-002..T-V-005 only when the matching script exists in SCRIPTS_AVAILABLE[]}

````

---

## design.md

```markdown
# Design: {LIBRARY} v{TARGET_VERSION} Migration

## Migration strategy

{Phase order: dependencies first (surface compilation errors before touching code), then
infrastructure, config, code. Main risk and mitigation.}

## Technical decisions

### Version range — `^{TARGET_VERSION}.0.0`

Caret (`^`) instead of an exact pin receives patches and minors automatically while keeping
major stability. `>=` is avoided so the next major is not accepted by accident.

### Configuration changes

{Per CONFIG_CHANGE: technical reasoning. E.g. MIDDY7-001: "Jest needs transformIgnorePatterns
because @middy v7 ships pure ESM and does not transpile node_modules; without it, tests fail
with a SyntaxError on import."}

### Breaking changes — impact analysis

{Per breaking change: technical impact and why the fix is correct, not a workaround.}
{If none: "No breaking changes were detected in this repository for this migration. Risk is low."}

### Ecosystem compatibility

{Related dependencies that may be affected (e.g. Middy v7 third-party middlewares). If none:
"No ecosystem dependencies with incompatibility risk were identified."}

### Analysis quality

- Coverage: {source_files_scanned} source, {test_files_scanned} tests, {config_files_scanned} config
- High-confidence matches: {N}
- Medium-confidence matches: {N}
- Low-confidence matches: {N}
- Manual review strategy for low confidence: {criterion applied}

## Change table

| File | Field / Pattern | Before | After |
|------|-----------------|--------|-------|
{One row per change in DEPENDENCY_CHANGES[], CONFIG_CHANGES[], BREAKING_CHANGES_IN_CODE[], BREAKING_CHANGES_IN_TESTS[]}

## References

- {DOCS_URL if available}
- {Additional links found during the analysis}
- Internal knowledge base consulted: {relevant break_ids from known-breaks.md}
```
