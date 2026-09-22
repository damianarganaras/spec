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

Generate an aspec change migrating any library/runtime to a new major version; never edit code.

**Usage:** `/ancleto-upgrade <library> <major> [docs-url]` — e.g. `node 22`, `@middy/core 7`.

---

## Step 1 — Parse arguments

- `LIBRARY` — library/runtime
- `TARGET_VERSION` — target major (`22`, `7`)
- `DOCS_URL` — migration guide URL (optional)
- `IS_RUNTIME` — `true` for `node`, `deno`, `bun`
- `LIBRARY_SLUG` — filename after the last `/` or `@`
- `CHANGE_NAME` — `${LIBRARY_SLUG}${TARGET_VERSION}-migration` (`node22-migration`)

### 1.1 Optional docs URL

Missing `DOCS_URL` → ask for an official migration guide/changelog URL (optional). URL → Step 3a; none → web search. Never block for lack of a URL.

## Step 2 — Detect current version in the repo

Detect `CURRENT_VERSION` before fetching docs; it drives Step 4 grep patterns.

```bash
# Runtimes: .nvmrc, engines, Dockerfiles, CI
cat .nvmrc 2>/dev/null
cat .node-version 2>/dev/null
grep -r "\"node\":" package.json
grep -rn "node-version\|nodeVersion" .github/ azure-pipelines.yml 2>/dev/null
find . -name "Dockerfile*" -not -path "*/node_modules/*" \
  -exec grep -l "FROM node:" {} \; 2>/dev/null | xargs grep "FROM node:" 2>/dev/null

# Libraries: all package.json
find . -name "package.json" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -not -name "package-lock.json" \
  | xargs grep -l "${LIBRARY}" 2>/dev/null \
  | xargs grep "${LIBRARY}" 2>/dev/null
```

Infer `CURRENT_VERSION` (`20` Node, `6` Middy); conflicts → record all as candidates.

## Step 3 — Get breaking changes from the docs

Derive `SEARCH_PATTERNS[]` from the real migration docs, never static.

### 3a. Fetch the docs

Run in parallel: `DOCS_URL` directly + always web search:

- `"{LIBRARY}" "v{TARGET_VERSION}" migration guide`
- `"{LIBRARY}" "{TARGET_VERSION}" breaking changes changelog`
- `github.com/{owner}/{repo}/releases/tag/v{TARGET_VERSION}`

Priority: user URL → official docs → release notes → GitHub changelog. Nothing found → document and continue.

### 3b. Extract breaking changes and build SEARCH_PATTERNS[]

```
{
  id: "BC-001" | source: URL | description: what breaks | fix: how to fix
  severity: "breaking"/"warning"/"info"
  patterns: [strings/regex] | file_types: [".ts", "jest.config.*"]
}
```

- `ReactDOM.render` removed → `["ReactDOM.render"]`
- Jest ESM needs `transformIgnorePatterns` → check jest.config

### 3c. Build VERSION_PATTERNS[] automatically

Always build patterns for every `CURRENT_VERSION` form (`high`), docs or not.

**Runtime (Node v20):**

```
NODEJS_20_X, nodejs20.x, Runtime.NODEJS_20_X  # Lambda runtime (CDK/TS)
node:20, node:20-alpine, node:20-slim  # Docker
"node": "20", "node": ">=20", "node": "^20"  # engines
nodeVersion: 20, node-version: 20, 20.x, v20  # CI/CD + generic
```

**Library (@middy/core v6):**

```
"@middy/core": "^6" / "6"  # package.json
@middy/core@6, middy@6  # inline refs
"@middy/": "^6"  # scoped packages
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

Record: `{file, line_number, line_content, pattern_matched, confidence: "high"}`

### 4b. Semantic breaking-change grep

```bash
grep -rn \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  -e "SEMANTIC_PATTERN_1" -e "SEMANTIC_PATTERN_2" \
  --exclude-dir=node_modules --exclude-dir=dist \
  .
```

Record: `{file, line_number, line_content, pattern_matched, break_id, confidence: "medium"}`

### 4c. Config files

```bash
find . \( -name "jest.config.*" -o -name "tsconfig*.json" \
  -o -name "vite.config.*" -o -name "vitest.config.*" \
  -o -name "rollup.config.*" -o -name "webpack.config.*" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Verify Step 3 config breaking changes per file (e.g. missing `transformIgnorePatterns`).

### 4d. Per-category registry (mandatory)

### 4d.1 Root package.json

```bash
cat package.json
```

Extract dependencies, scripts, `workspaces`.

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

Same files as 4c.

- `jest.config.*`: `transformIgnorePatterns`, `transform`, `testEnvironment`
- `tsconfig*.json`: `target`, `module`, `moduleResolution`, `verbatimModuleSyntax`
- apply matching `SEARCH_PATTERNS[]` `file_types`

### 4d.8 Source code

```bash
find . \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -not -name "*.spec.*" -not -name "*.test.*" | sort
```

Per file:

- direct `LIBRARY` use (imports/requires)
- global `SEARCH_PATTERNS[]` without a direct import (`url.parse`, deprecated APIs) or non-import `VERSION_PATTERNS[]` (`NODEJS_20_X`, `node:20`)
- evaluate **every file**; per match `{file, line_number, snippet, break_id?, pattern_matched, confidence}`
- snippets: exact line + 2 lines around, never ambiguous

### 4d.9 Tests

```bash
find . \( -name "*.spec.ts" -o -name "*.test.ts" \
  -o -name "*.spec.tsx" -o -name "*.test.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

As 4d.8, with both pattern sets.

**Coverage (mandatory):** report `source_files_scanned`, `test_files_scanned`, `config_files_scanned`; 0 → explain why. Also `total_matches`, `patterns_used`.

---

## Step 5 — Classify findings

| Output | Contents |
| ------ | -------- |
| `BREAKING_CHANGES_IN_CODE[]` | `id`, `description`, `fix`, `severity`, `source`, `affected_files[{file, line_number, snippet, confidence}]` |
| `BREAKING_CHANGES_IN_TESTS[]` | same schema, `.spec.ts/.test.ts` |
| `CONFIG_CHANGES[]` | `file`, `description`, `current_value`, `target_value`, `source` |
| `DEPENDENCY_CHANGES[]` | `path`, `package_name`, `current_version`, `target_version` |
| `SCRIPTS_AVAILABLE[]` | root scripts |
| `UNSURE_MATCHES[]` | `file`, `line_number`, `snippet`, `reason` |

**Confidence:** `high` = VERSION_PATTERNS (hardcoded); `medium` = semantic doc match; `low` = ambiguous.

---

## Step 6 — Create the aspec change

Create `aspec/changes/${CHANGE_NAME}/` (+ `specs/` if applicable). If it exists, ask: `-v2` or delete.

## Step 7 — Write the aspec artifacts

Read `references/templates.md`; write in order `proposal.md`, `specs/{LIBRARY_SLUG}{TARGET_VERSION}.md`, `tasks.md`, `design.md`.

- every code match: `file`, `line_number`, `snippet`
- `confidence` (`high|medium|low`)
- Phase 6 tasks only for scripts in `SCRIPTS_AVAILABLE[]`
- `IS_RUNTIME = false` → Phase 2 "Not applicable"
- no breaking changes → keep the phase with a note (never omit)
- Nx monorepos → `npm` and `npx nx` commands

---

## Step 8 — Show the final summary

```
## Change created: {CHANGE_NAME}
Library: {LIBRARY} {CURRENT_VERSION} → v{TARGET_VERSION} | Docs: {URL(s) | "None found — VERSION_PATTERNS only"}
Patterns: {N} version (high) + {N} semantic (docs) | Analysis: {source_files_scanned} source / {test_files_scanned} tests / {config_files_scanned} config / {total_matches} matches
Affected: {N} package.json, {N} config, {N} code, {N} tests | Breaking changes: {id/severity/description/occurrences/confidence | "None detected"}
Low confidence: {file:line + reason | "None"} | Scripts: build/lint/test/test:ci/typecheck yes|no
Artifacts: proposal.md ✅ | specs/{LIBRARY_SLUG}{TARGET_VERSION}.md ✅ | tasks.md ✅ ({N} tasks, 6 phases) | design.md ✅
Implement: /cleto-apply {CHANGE_NAME}
```

---

## Guardrails

aspec artifacts only — never edits repo files; real changes run via `/cleto-apply`.

- Do not touch files outside `aspec/changes/{CHANGE_NAME}/`
- `VERSION_PATTERNS[]` always apply (docs or not)
- No docs → document and continue
- Change exists → warn before any action
- Always report coverage and patterns used
