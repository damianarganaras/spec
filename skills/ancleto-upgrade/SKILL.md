---
name: ancleto-upgrade
description: >
  Universal upgrade skill. Use this skill whenever a user wants to
  migrate a dependency, library, or runtime to a new major version — including
  Node.js, TypeScript, React, Middy, or any npm package. Triggers on phrases
  like "migrar a", "upgrade a", "actualizar a", "mover a v", or any mention of
  bumping a major version. Analyzes the full repository (TypeScript source, tests,
  config, CI, Docker, CDK), fetches official migration docs, builds search patterns
  dynamically from those docs, and generates a complete OpenSpec change with phased
  tasks — without touching any code.
license: MIT
compatibility: Requires openspec CLI, Node.js
metadata:
  author: ancleto
  version: '4.0'
  category: migrations
---

# ancleto-upgrade

Analiza el repositorio completo y genera un OpenSpec change para migrar cualquier
librería o runtime a una nueva versión mayor — de forma documentada, faseada y sin
romper el repo.

El análisis es completamente dinámico: detecta la versión actual en el repo, obtiene
los breaking changes de la documentación oficial, construye los patterns de búsqueda
a partir de eso, y escanea todo el código. Sin listas estáticas.

**Ejemplos de uso:**

- `/ancleto-upgrade node 22` → migra Node.js a v22
- `/ancleto-upgrade @middy/core 7` → migra Middy a v7
- `/ancleto-upgrade @middy/core 7 https://middy.js.org/docs/upgrade/v7` → con docs
- `/ancleto-upgrade react 19` → migra React a v19
- `/ancleto-upgrade typescript 5.8` → migra TypeScript a 5.8

---

## Paso 1 — Parsear argumentos

Del mensaje del usuario, extraer:

- `LIBRARY` — nombre de la librería o runtime (ej: `node`, `@middy/core`, `react`)
- `TARGET_VERSION` — versión objetivo, solo major (ej: `22`, `7`, `19`)
- `DOCS_URL` — URL de migration guide (opcional, puede venir en el mensaje)
- `IS_RUNTIME` — `true` si LIBRARY es `node`, `deno` o `bun`
- `LIBRARY_SLUG` — nombre seguro para archivos:
  - `node` → `node` | `@middy/core` → `middy` | `@aws-sdk/client-s3` → `aws-sdk`
  - Regla: parte después del último `/` o `@`, sin caracteres especiales
- `CHANGE_NAME` — `${LIBRARY_SLUG}${TARGET_VERSION}-migration` (ej: `node22-migration`)

### 1.1 URL opcional de documentación

Si el usuario no incluyó `DOCS_URL`, preguntar de forma explícita y breve:

- "¿Querés pasar una URL oficial de migration guide/changelog de {LIBRARY} v{TARGET_VERSION}? (opcional)"

Regla:

- Si responde con URL, usarla en Paso 3a
- Si responde que no, continuar automáticamente con Paso 3a (búsqueda web)
- Nunca bloquear la ejecución por no tener URL

---

## Paso 2 — Detectar versión actual en el repo

Antes de buscar documentación, detectar `CURRENT_VERSION` — la versión que tiene el
repo hoy. Esto es crítico para construir los patterns de grep del Paso 4.

```bash
# Para runtimes: buscar en .nvmrc, engines, Dockerfiles, CI
cat .nvmrc 2>/dev/null
cat .node-version 2>/dev/null
grep -r "\"node\":" package.json
grep -rn "node-version\|nodeVersion" .github/ azure-pipelines.yml 2>/dev/null
find . -name "Dockerfile*" -not -path "*/node_modules/*" \
  -exec grep -l "FROM node:" {} \; 2>/dev/null | xargs grep "FROM node:" 2>/dev/null

# Para librerías: buscar en todos los package.json
find . -name "package.json" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -not -name "package-lock.json" \
  | xargs grep -l "${LIBRARY}" 2>/dev/null \
  | xargs grep "${LIBRARY}" 2>/dev/null
```

De estos resultados, inferir `CURRENT_VERSION` (ej: `20` para Node, `6` para Middy).

Si hay versiones inconsistentes entre archivos, registrarlas todas — son candidatas
a cambio también.

---

## Paso 3 — Obtener breaking changes de la documentación

El objetivo es construir `SEARCH_PATTERNS[]` — qué buscar en el repo y por qué.
Los patterns NO son estáticos: se derivan de la documentación real de la migración.

### 3a. Obtener la documentación

Ejecutar en paralelo:

**Si el usuario proveyó DOCS_URL:** hacer fetch directo.

**Siempre, en paralelo:** buscar en internet:

- `"{LIBRARY}" "v{TARGET_VERSION}" migration guide`
- `"{LIBRARY}" "{TARGET_VERSION}" breaking changes changelog`
- Releases oficiales en GitHub: `github.com/{owner}/{repo}/releases/tag/v{TARGET_VERSION}`

Priorizar: URL del usuario → docs oficiales → release notes → changelog GitHub.

Si no se encuentra nada: documentarlo y continuar — el Paso 4 igual detecta
referencias a `CURRENT_VERSION` en todo el repo.

### 3b. Extraer breaking changes y construir SEARCH_PATTERNS[]

De la documentación obtenida, extraer cada breaking change y construir un entry:

```
{
  id:          string único (ej: "BC-001")
  source:      URL de donde viene
  description: qué cambia y por qué rompe
  fix:         cómo arreglarlo
  severity:    "breaking" | "warning" | "info"
  patterns:    [strings o regex a buscar en el repo]
  file_types:  [".ts", ".js", "jest.config.*", "Dockerfile", etc.]
}
```

Ejemplos de cómo derivar patterns de la documentación:

- Doc dice "`ReactDOM.render` fue eliminado" → patterns: `["ReactDOM.render"]`
- Doc dice "`useFormState` se renombró" → patterns: `["useFormState"]`
- Doc dice "Jest necesita `transformIgnorePatterns` para ESM" → verificar ausencia en jest.config
- Doc dice "versión mínima de Node es 22" → pattern: `engines.node` con valor < 22

### 3c. Construir VERSION_PATTERNS[] automáticamente

Independientemente de la doc, siempre construir patterns para encontrar cualquier
referencia a `CURRENT_VERSION` en todas sus formas. Estos tienen confianza `high`
porque toda mención de la versión vieja es candidata a actualización.

Derivar las formas según el tipo:

**Si IS_RUNTIME = true (Node.js como ejemplo con CURRENT_VERSION=20):**

```
NODEJS_20_X, NODEJS_20           # Lambda runtime strings (CDK/TS)
nodejs20.x                       # runtime string literal (app settings / tests)
Runtime.NODEJS_20_X              # enum usage in CDK code
node:20, node:20-alpine, node:20-slim, node:20-bullseye  # Docker
"node": "20", "node": ">=20", "node": "^20"  # engines package.json
nodeVersion: 20, node-version: 20, node-version: '20'   # CI/CD
20.x, v20                        # referencias genéricas
```

**Si IS_RUNTIME = false (librería npm como ejemplo con @middy/core v6):**

```
"@middy/core": "^6", "@middy/core": "6"   # package.json
@middy/core@6, middy@6                        # referencias inline
"@middy/": "^6"                             # todos los scoped packages
```

Adaptar estos patterns al LIBRARY y CURRENT_VERSION detectados. El objetivo es no
perder ninguna ocurrencia de la versión vieja en ningún tipo de archivo.

## Paso 4 — Escanear el repo

Con `SEARCH_PATTERNS[]` (de la doc) + `VERSION_PATTERNS[]` (automáticos) del Paso 3,
escanear exhaustivamente. Ejecutar todo en paralelo.

### 4a. Grep de versión — todo el repo

```bash
grep -rn \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  --include="*.json" --include="*.yml" --include="*.yaml" \
  --include="Dockerfile*" --include="*.tf" --include="*.sh" \
  -e "PATTERN_1" -e "PATTERN_2" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  .
```

Reemplazar con los VERSION_PATTERNS[] reales. Registrar cada match:
`{file, line_number, line_content, pattern_matched, confidence: "high"}`

### 4b. Grep de breaking changes semánticos

```bash
grep -rn \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  -e "SEMANTIC_PATTERN_1" -e "SEMANTIC_PATTERN_2" \
  --exclude-dir=node_modules --exclude-dir=dist \
  .
```

Reemplazar con los patterns de SEARCH_PATTERNS[]. Registrar cada match:
`{file, line_number, line_content, pattern_matched, break_id, confidence: "medium"}`

### 4c. Archivos de configuración

```bash
find . \( -name "jest.config.*" -o -name "tsconfig*.json" \
  -o -name "vite.config.*" -o -name "vitest.config.*" \
  -o -name "rollup.config.*" -o -name "webpack.config.*" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Leer cada uno y verificar breaking changes de configuración del Paso 3
(ej: ausencia de `transformIgnorePatterns`, valor de `moduleResolution`).

### 4d. Registro por categoría (obligatorio)

Además de los grep agregados, ejecutar este escaneo por categoría para asegurar
cobertura exhaustiva y permitir snippets accionables en proposal/tasks:

### 4d.1 package.json raíz

```bash
cat package.json
```

Extraer: dependencias relacionadas con LIBRARY (versión actual), scripts disponibles
(`build`, `lint`, `test`, `test:ci`, `typecheck`), campo `workspaces`.

### 4d.2 Todos los package.json del monorepo

```bash
find . -name "package.json" \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -not -path "*/dist/*" -not -path "*/.nx/*" \
  -not -name "package-lock.json" | sort
```

Para cada uno: dependencias relacionadas con LIBRARY, `engines.node`, `name`.

### 4d.3 Archivos CI/CD

```bash
find . \( -name "azure-pipelines.yml" -o -path "*/.github/workflows/*.yml" \) \
  -not -path "*/node_modules/*" | sort
```

Buscar: `nodeVersion`, `node-version`, imagen base de Node.

### 4d.4 Configuración de runtime

```bash
cat .nvmrc 2>/dev/null || echo "NO_NVMRC"
cat .node-version 2>/dev/null || echo "NO_NODE_VERSION"
```

### 4d.5 Dockerfiles

```bash
find . -name "Dockerfile*" -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Para cada uno: buscar `FROM node:X` o `FROM node:X-alpine`.

### 4d.6 CDK / Lambda appSettings

```bash
find . -name "appSettings*.json" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Buscar el campo `"Runtime"`.

### 4d.7 Build, tests y tsconfig

```bash
find . \( -name "jest.config.*" -o -name "tsconfig*.json" \
  -o -name "vite.config.*" -o -name "vitest.config.*" \
  -o -name "rollup.config.*" -o -name "webpack.config.*" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Para `jest.config.*`: registrar `transformIgnorePatterns`, `transform`, `testEnvironment`.
Para `tsconfig*.json`: registrar `target`, `module`, `moduleResolution`, `verbatimModuleSyntax`.
Aplicar `SEARCH_PATTERNS[]` con `file_types` que incluyan `jest.config.*` o `tsconfig`.

### 4d.8 Código fuente

```bash
find . \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  -not -name "*.spec.*" -not -name "*.test.*" | sort
```

Para cada archivo de código:

- Detectar uso directo de `LIBRARY` (imports/requires)
- Detectar también patrones globales de `SEARCH_PATTERNS[]` aunque no haya import directo
  (ej: `url.parse`, APIs deprecadas, patrones de ESM/CJS)
- Detectar `VERSION_PATTERNS[]` de runtime/dependencia aunque no estén ligados a imports
  (ej: `NODEJS_20_X`, `Runtime.NODEJS_20_X`, `nodejs20.x`, `node:20`)
- Evaluar **cada archivo** y registrar evidencia por match:
  `{file, line_number, snippet, break_id?, pattern_matched, confidence}`

Formato de snippet:

- incluir línea exacta + contexto breve (2 líneas antes / 2 líneas después)
- evitar snippets ambiguos o sin contexto

### 4d.9 Tests

```bash
find . \( -name "*.spec.ts" -o -name "*.test.ts" \
  -o -name "*.spec.tsx" -o -name "*.test.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```

Mismo proceso que 4d.8, aplicando `SEARCH_PATTERNS[]` + `VERSION_PATTERNS[]` para tests.

Regla de cobertura obligatoria:

- Reportar cuántos archivos fueron analizados por categoría:
  - `source_files_scanned`
  - `test_files_scanned`
  - `config_files_scanned`
- Si alguna categoría queda en 0, explicar por qué (no existe, filtros, etc.)
- Registrar además:
  - `total_matches`
  - `patterns_used`

---

## Paso 5 — Clasificar hallazgos

Con todos los matches del Paso 4, construir:

- **`BREAKING_CHANGES_IN_CODE[]`** — matches en `.ts/.js` (no tests):
  `id`, `description`, `fix`, `severity`, `source`,
  `affected_files[{file, line_number, snippet, confidence}]`

- **`BREAKING_CHANGES_IN_TESTS[]`** — mismo esquema para `.spec.ts/.test.ts`

- **`CONFIG_CHANGES[]`** — archivos de config a modificar:
  `file`, `description`, `current_value`, `target_value`, `source`

- **`DEPENDENCY_CHANGES[]`** — package.json afectados:
  `path`, `package_name`, `current_version`, `target_version`

- **`SCRIPTS_AVAILABLE[]`** — scripts detectados en package.json raíz

- **`UNSURE_MATCHES[]`** — matches de baja confianza para revisión manual:
  `file`, `line_number`, `snippet`, `reason`

**Regla de confianza:**

- `high` — match de VERSION_PATTERNS (versión vieja hardcodeada)
- `medium` — match semántico derivado de la doc (API deprecada, flag eliminado)
- `low` — match ambiguo, posible falso positivo

---

## Paso 6 — Crear el change OpenSpec

```bash
openspec new change "${CHANGE_NAME}"
```

Si el nombre ya existe, preguntar al usuario: agregar sufijo `-v2` o eliminar el existente.

---

## Paso 7 — Escribir los artefactos OpenSpec

Leer `references/templates.md` para obtener los templates exactos de cada archivo.
Escribir en este orden:

1. `proposal.md`
2. `specs/{LIBRARY_SLUG}{TARGET_VERSION}.md`
3. `tasks.md`
4. `design.md`

Reglas al completar los templates:

- Cada match de código debe incluir `file`, `line_number` y `snippet` para ser accionable
- Cada match debería incluir `confidence` (`high|medium|low`) cuando aplique
- Las tareas de verificación (Fase 6) solo se incluyen si el script existe en `SCRIPTS_AVAILABLE[]`
- Si `IS_RUNTIME = false`, la Fase 2 se marca como "No aplica"
- Si no hay breaking changes en código o tests, incluir la fase con nota explicativa (nunca omitirla)
- En monorepos Nx, incluir tanto el comando `npm` como el equivalente `npx nx`
- Incluir siempre: cobertura del escaneo y lista de patterns utilizados

---

## Paso 8 — Mostrar resumen final

```
## Change creado: {CHANGE_NAME}

### Librería migrada
{LIBRARY} {CURRENT_VERSION} → v{TARGET_VERSION}

### Documentación utilizada
{URL(s) consultadas | "No se encontró documentación oficial — se usaron VERSION_PATTERNS únicamente"}

### Patterns aplicados
- De versión (high confidence): {N} patterns para todas las formas de "{CURRENT_VERSION}"
- Semánticos (de la doc): {N} patterns

### Análisis del repositorio
- Cobertura: {source_files_scanned} source, {test_files_scanned} tests, {config_files_scanned} config
- Total matches: {total_matches}
- package.json afectados: {N}
- Archivos de configuración a modificar: {N}
- Archivos de código con issues: {N}
- Archivos de tests con issues: {N}

### Breaking changes detectados
{lista: id, severity, description, N ocurrencias, confidence}
{o: "Ninguno detectado"}

### Matches de baja confianza — revisar manualmente
{lista con file:line + razón | "Ninguno"}

### Scripts de verificación
build: sí/no | lint: sí/no | test: sí/no | test:ci: sí/no | typecheck: sí/no

### Artefactos OpenSpec generados
- proposal.md ✅
- specs/{LIBRARY_SLUG}{TARGET_VERSION}.md ✅
- tasks.md ✅ ({N} tareas en 6 fases)
- design.md ✅

Para implementar: /opsx-apply {CHANGE_NAME}
```

---

## Guardrails

Este skill solo genera artefactos OpenSpec — no modifica ningún archivo del repo.
Todo cambio real lo ejecuta el desarrollador con `/opsx-apply`, que tiene su propio
ciclo de revisión. Modificar el repo desde este skill saltearía ese control.

- No tocar archivos fuera de `openspec/changes/{CHANGE_NAME}/`
- Los `VERSION_PATTERNS[]` siempre se aplican, con o sin documentación oficial
- Si no hay doc disponible, documentarlo en proposal y continuar con el escaneo
- Si el change ya existe, avisar antes de cualquier acción
- Reportar siempre cobertura del escaneo y patterns utilizados
