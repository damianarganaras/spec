---
name: ancleto-upgrade
description: >
  Universal upgrade skill. Use this skill whenever a user wants to
  migrate a dependency, library, or runtime to a new major version — including
  Node.js, TypeScript, React, Middy, or any npm package. Triggers on phrases
  like "migrar a", "upgrade a", "actualizar a", "mover a v", or any mention of
  bumping a major version. Analyzes the full repository (TypeScript source, tests,
  config, CI, Docker, CDK), fetches official migration docs, builds search patterns
  dynamically from those docs, and generates a complete aspec change with phased
  tasks — without touching any code.
license: MIT
compatibility: Requires Node.js (no external CLI)
metadata:
  author: ancleto
  version: '4.0'
  category: migrations
---

# ancleto-upgrade

**Artifacts language**: write every artifact in English. Keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`, `ADDED/MODIFIED/REMOVED/RENAMED Requirements`) are literal and MUST NOT be translated. File and directory names stay English kebab-case.

Generate an aspec change to migrate any library/runtime to a new major version. No code
edits. Fully dynamic: detect the current repo version → fetch breaking changes from official
docs → derive search patterns → scan all code. No static lists.

**Usage:** `/ancleto-upgrade <library> <major> [docs-url]` — e.g. `node 22`, `@middy/core 7`,
`react 19`, `typescript 5.8`, `@middy/core 7 https://middy.js.org/docs/upgrade/v7`.

---

## Step 1 — Parse arguments

Extract from the user message:

- `LIBRARY` — library/runtime (`node`, `@middy/core`, `react`)
- `TARGET_VERSION` — target major (`22`, `7`, `19`)
- `DOCS_URL` — migration guide URL (optional)
- `IS_RUNTIME` — `true` for `node`, `deno`, `bun`
- `LIBRARY_SLUG` — safe file name: `node` → `node`, `@middy/core` → `middy`, `@aws-sdk/client-s3` → `aws-sdk` (part after the last `/` or `@`, no special characters)
- `CHANGE_NAME` — `${LIBRARY_SLUG}${TARGET_VERSION}-migration` (`node22-migration`)

### 1.1 Optional docs URL

If `DOCS_URL` is missing, ask: "Provide an official migration guide/changelog URL for
{LIBRARY} v{TARGET_VERSION}? (optional)". URL → Step 3a; none → Step 3a web search. Never
block execution for lack of a URL.

---

## Step 2 — Detect current version in the repo

Detect `CURRENT_VERSION` before fetching docs — critical for the Step 4 grep patterns.

```bash
# Runtimes: look in .nvmrc, engines, Dockerfiles, CI
cat .nvmrc 2>/dev/null
cat .node-version 2>/dev/null
grep -r "\"node\":" package.json
grep -rn "node-version\|nodeVersion" .github/ azure-pipelines.yml 2>/dev/null
find . -name "Dockerfile*" -not -path "*/node_modules/*" \
  -exec grep -l "FROM node:" {} \; 2>/dev/null | xargs grep "FROM node:" 2>/dev/null

# Libraries: look in all package.json
find . -name "package.json" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -not -name "package-lock.json" \
  | xargs grep -l "${LIBRARY}" 2>/dev/null \
  | xargs grep "${LIBRARY}" 2>/dev/null
```

Infer `CURRENT_VERSION` (`20` Node, `6` Middy). Conflicting versions → record all; also
change candidates.

---

## Step 3 — Get breaking changes from the docs

Build `SEARCH_PATTERNS[]` (what to search, why) from the real migration docs, never static.

### 3a. Fetch the docs

Run in parallel. `DOCS_URL` → fetch directly. Always also web search:

- `"{LIBRARY}" "v{TARGET_VERSION}" migration guide`
- `"{LIBRARY}" "{TARGET_VERSION}" breaking changes changelog`
- Official GitHub releases: `github.com/{owner}/{repo}/releases/tag/v{TARGET_VERSION}`

Priority: user URL → official docs → release notes → GitHub changelog. Nothing found →
document it and continue; Step 4 still finds `CURRENT_VERSION` references.

### 3b. Extract breaking changes and build SEARCH_PATTERNS[]

One entry per breaking change:

```
{
  id:          unique string (e.g. "BC-001")
  source:      URL it comes from
  description: what changes and why it breaks
  fix:         how to fix it
  severity:    "breaking" | "warning" | "info"
  patterns:    [strings or regex to search in the repo]
  file_types:  [".ts", ".js", "jest.config.*", "Dockerfile", etc.]
}
```

Derive patterns from docs:

- "`ReactDOM.render` was removed" → `["ReactDOM.render"]`
- "`useFormState` was renamed" → `["useFormState"]`
- "Jest needs `transformIgnorePatterns` for ESM" → check its absence in jest.config
- "minimum Node version is 22" → pattern `engines.node` with value < 22

### 3c. Build VERSION_PATTERNS[] automatically

Always build patterns for every form of `CURRENT_VERSION`, docs or not — `high` confidence:
any old-version mention is a change candidate.

**IS_RUNTIME = true (Node example, CURRENT_VERSION=20):**

```
NODEJS_20_X, NODEJS_20           # Lambda runtime strings (CDK/TS)
nodejs20.x                       # runtime string literal (app settings / tests)
Runtime.NODEJS_20_X              # enum usage in CDK code
node:20, node:20-alpine, node:20-slim, node:20-bullseye  # Docker
"node": "20", "node": ">=20", "node": "^20"  # engines package.json
nodeVersion: 20, node-version: 20, node-version: '20'   # CI/CD
20.x, v20                        # generic references
```

**IS_RUNTIME = false (npm library, @middy/core v6):**

```
"@middy/core": "^6", "@middy/core": "6"   # package.json
@middy/core@6, middy@6                        # inline references
"@middy/": "^6"                             # all scoped packages
```

Adapt to LIBRARY/CURRENT_VERSION; miss no old-version occurrence.

## Step 4 — Scan the repo

Run both Step 3 pattern sets exhaustively, in parallel.

### 4a. Version grep — whole repo

```bash
grep -rn \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  --include="*.json" --include="*.yml" --include="*.yaml" \
  --include="Dockerfile*" --include="*.tf" --include="*.sh" \
  -e "PATTERN_1" -e "PATTERN_2" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  .
```

Replace with the real VERSION_PATTERNS[]. Record:
`{file, line_number, line_content, pattern_matched, confidence: "high"}`

### 4b. Semantic breaking-change grep

```bash
grep -rn \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  -e "SEMANTIC_PATTERN_1" -e "SEMANTIC_PATTERN_2" \
  --exclude-dir=node_modules --exclude-dir=dist \
  .
```

Replace with SEARCH_PATTERNS[]. Record:
`{file, line_number, line_content, pattern_matched, break_id, confidence: "medium"}`

### 4c. Config files

```bash
find . \( -name "jest.config.*" -o -name "tsconfig*.json" \
  -o -name "vite.config.*" -o -name "vitest.config.*" \
  -o -name "rollup.config.*" -o -name "webpack.config.*" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Verify Step 3 config breaking changes per file (e.g. missing `transformIgnorePatterns`,
`moduleResolution`).

### 4d. Per-category registry (mandatory)

Per-category scan for exhaustive coverage and actionable snippets:

### 4d.1 Root package.json

```bash
cat package.json
```

Extract LIBRARY dependencies (current version), scripts (`build`, `lint`, `test`, `test:ci`,
`typecheck`), `workspaces`.

### 4d.2 All monorepo package.json

```bash
find . -name "package.json" \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -not -path "*/dist/*" -not -path "*/.nx/*" \
  -not -name "package-lock.json" | sort
```

Per file: LIBRARY dependencies, `engines.node`, `name`.

### 4d.3 CI/CD files

```bash
find . \( -name "azure-pipelines.yml" -o -path "*/.github/workflows/*.yml" \) \
  -not -path "*/node_modules/*" | sort
```

Look for `nodeVersion`, `node-version`, Node base image.

### 4d.4 Runtime config

```bash
cat .nvmrc 2>/dev/null || echo "NO_NVMRC"
cat .node-version 2>/dev/null || echo "NO_NODE_VERSION"
```

### 4d.5 Dockerfiles

```bash
find . -name "Dockerfile*" -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Per file: `FROM node:X` or `FROM node:X-alpine`.

### 4d.6 CDK / Lambda appSettings

```bash
find . -name "appSettings*.json" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Look for `"Runtime"`.

### 4d.7 Build, tests and tsconfig

```bash
find . \( -name "jest.config.*" -o -name "tsconfig*.json" \
  -o -name "vite.config.*" -o -name "vitest.config.*" \
  -o -name "rollup.config.*" -o -name "webpack.config.*" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

- `jest.config.*`: `transformIgnorePatterns`, `transform`, `testEnvironment`
- `tsconfig*.json`: `target`, `module`, `moduleResolution`, `verbatimModuleSyntax`
- apply `SEARCH_PATTERNS[]` whose `file_types` include `jest.config.*` or `tsconfig`

### 4d.8 Source code

```bash
find . \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -not -name "*.spec.*" -not -name "*.test.*" | sort
```

Per file:

- direct `LIBRARY` use (imports/requires)
- global `SEARCH_PATTERNS[]` without a direct import (e.g. `url.parse`, deprecated APIs, ESM/CJS)
- runtime/dependency `VERSION_PATTERNS[]` not import-related (e.g. `NODEJS_20_X`, `Runtime.NODEJS_20_X`, `nodejs20.x`, `node:20`)
- evaluate **every file**; per match record `{file, line_number, snippet, break_id?, pattern_matched, confidence}`
- snippets: exact line + 2 lines before/after, never ambiguous or context-free

### 4d.9 Tests

```bash
find . \( -name "*.spec.ts" -o -name "*.test.ts" \
  -o -name "*.spec.tsx" -o -name "*.test.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Same as 4d.8 with both pattern sets.

**Coverage (mandatory):** report files analyzed per category (`source_files_scanned`,
`test_files_scanned`, `config_files_scanned`); 0 → explain why. Also record `total_matches`,
`patterns_used`.

---

## Step 5 — Classify findings

Build from all Step 4 matches:

| Output | Contents |
| ------ | -------- |
| `BREAKING_CHANGES_IN_CODE[]` | `id`, `description`, `fix`, `severity`, `source`, `affected_files[{file, line_number, snippet, confidence}]` |
| `BREAKING_CHANGES_IN_TESTS[]` | same schema, `.spec.ts/.test.ts` |
| `CONFIG_CHANGES[]` | `file`, `description`, `current_value`, `target_value`, `source` |
| `DEPENDENCY_CHANGES[]` | `path`, `package_name`, `current_version`, `target_version` |
| `SCRIPTS_AVAILABLE[]` | root package.json scripts |
| `UNSURE_MATCHES[]` | `file`, `line_number`, `snippet`, `reason` |

**Confidence:** `high` = VERSION_PATTERNS (hardcoded old version); `medium` = semantic doc match
(deprecated API, removed flag); `low` = ambiguous, possible false positive.

---

## Step 6 — Create the aspec change

Create `aspec/changes/${CHANGE_NAME}/` (with `specs/` if applicable). If it exists, ask: `-v2`
suffix or delete the existing one.

---

## Step 7 — Write the aspec artifacts

Read `references/templates.md`; write in order `proposal.md`,
`specs/{LIBRARY_SLUG}{TARGET_VERSION}.md`, `tasks.md`, `design.md`.

- every code match: `file`, `line_number`, `snippet`
- include `confidence` (`high|medium|low`) where applicable
- Phase 6 tasks only for scripts in `SCRIPTS_AVAILABLE[]`
- `IS_RUNTIME = false` → Phase 2 "Not applicable"
- no breaking changes in code/tests → keep the phase with an explanatory note (never omit)
- Nx monorepos → both `npm` and `npx nx` commands
- always include scan coverage and patterns used

---

## Step 8 — Show the final summary

```
## Change created: {CHANGE_NAME}
Library: {LIBRARY} {CURRENT_VERSION} → v{TARGET_VERSION}
Docs: {URL(s) consulted | "None found — VERSION_PATTERNS only"}
Patterns: {N} version (high confidence) + {N} semantic (from docs)
Analysis: {source_files_scanned} source, {test_files_scanned} tests, {config_files_scanned} config | {total_matches} matches
Affected: {N} package.json, {N} config, {N} code, {N} test files
Breaking changes: {list id/severity/description/N occurrences/confidence | "None detected"}
Low confidence — review manually: {file:line + reason | "None"}
Scripts: build: yes/no | lint: yes/no | test: yes/no | test:ci: yes/no | typecheck: yes/no
Artifacts: proposal.md ✅ | specs/{LIBRARY_SLUG}{TARGET_VERSION}.md ✅ | tasks.md ✅ ({N} tasks, 6 phases) | design.md ✅
Implement: /cleto-apply {CHANGE_NAME}
```

---

## Guardrails

Generates aspec artifacts only — never edits repo files. Real changes run via `/cleto-apply`
(own review cycle); editing here would bypass it.

- Do not touch files outside `aspec/changes/{CHANGE_NAME}/`
- `VERSION_PATTERNS[]` always apply, with or without official docs
- No docs → document it in proposal and continue scanning
- Change already exists → warn before any action
- Always report scan coverage and patterns used
