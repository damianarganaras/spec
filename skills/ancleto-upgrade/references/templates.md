# Templates — Artefactos OpenSpec

Este archivo contiene los templates exactos para los cuatro artefactos que genera
el skill. Leer este archivo en el Paso 6 y completar cada placeholder `{...}`.

---

## proposal.md

```markdown
# Propuesta: Migración a {LIBRARY} v{TARGET_VERSION}

## Contexto

{Descripción del estado actual: versión actual de LIBRARY instalada, razón para migrar
(EOL, mejoras de performance, compatibilidad, nuevas features). Si se obtuvo documentación
oficial, resumir los puntos más relevantes del changelog aquí.}

## Cobertura del análisis

- source files analizados: {source_files_scanned}
- test files analizados: {test_files_scanned}
- config files analizados: {config_files_scanned}
- archivos con matches: {files_with_matches}
- archivos sin matches: {files_without_matches}

## Alcance del cambio

### Dependencias afectadas — {N} paquetes en {M} package.json

| package.json | Paquete | Versión actual | Versión objetivo |
| ------------ | ------- | -------------- | ---------------- |

{Una fila por cada entry en DEPENDENCY_CHANGES[]}

### Archivos de configuración a modificar — {N} archivos

{Lista de archivos con descripción del cambio requerido. Si no hay, escribir "Ninguno."}

### Código fuente con breaking changes — {N} archivos

{Lista de archivos afectados con el breaking change detectado. Si no hay, escribir "Ninguno."}

### Tests con breaking changes — {N} archivos

{Lista de archivos de test afectados. Si no hay, escribir "Ninguno."}

## Evaluación de breaking changes

{Para cada KNOWN_BREAK relevante a la migración:}

- ✅ AFECTA — {id}: {description} — {N} ocurrencias en {M} archivos
- ✓ NO AFECTA — {id}: {description}

## Matches de baja confianza

{Lista de UNSURE_MATCHES[] para revisión manual. Si no hay, escribir "Ninguno."}

## Decisión

Migrar {LIBRARY} {CURRENT_VERSION} → v{TARGET_VERSION}.

Fuente de información: {DOCS_URL | "Búsqueda web: {query}" | "Knowledge base interna"}
```

---

## specs/{LIBRARY_SLUG}{TARGET_VERSION}.md

```markdown
# Especificaciones: {LIBRARY} v{TARGET_VERSION} Migration

## Dependencias

{Para cada entry en DEPENDENCY_CHANGES[]:}

- REQ-D-{N}: `{package_name}` en `{path}` SHALL usar versión `^{TARGET_VERSION}.0.0`

## Configuración

{Para cada entry en CONFIG_CHANGES[]:}

- REQ-C-{N}: `{file}` SHALL {descripción del cambio requerido}

{Si CONFIG_CHANGES está vacío:}
No se requieren cambios de configuración.

## Código fuente

{Para cada entry en BREAKING_CHANGES_IN_CODE[]:}

- REQ-S-{N} [{break_id}]: {descripción del cambio requerido en el código}
  Evidencia: `{file}:{line_number}` ({confidence})

{Si BREAKING_CHANGES_IN_CODE está vacío:}
No se detectaron breaking changes en código fuente.

## Tests

{Para cada entry en BREAKING_CHANGES_IN_TESTS[]:}

- REQ-T-{N} [{break_id}]: {descripción del cambio requerido en los tests}
  Evidencia: `{file}:{line_number}` ({confidence})

{Si BREAKING_CHANGES_IN_TESTS está vacío:}
No se detectaron breaking changes en tests.

## Verificación

- REQ-V-001: El proyecto SHALL compilar sin errores TypeScript
- REQ-V-002: Todos los tests SHALL pasar luego de la migración
  {Si lint script existe:}
- REQ-V-003: El proyecto SHALL pasar lint sin errores

## Cobertura

- REQ-X-001: El análisis SHALL incluir todo archivo de código fuente elegible (`.ts`, `.tsx`, `.js`) excluyendo `node_modules`, `dist` y artefactos generados
- REQ-X-002: El análisis SHALL incluir todo archivo de tests elegible (`*.spec.*`, `*.test.*`)
- REQ-X-003: El resultado SHALL reportar métricas de cobertura (`source_files_scanned`, `test_files_scanned`, `config_files_scanned`)
```

---

## tasks.md

````markdown
# Tasks: {LIBRARY} v{TARGET_VERSION} Migration

## Fase 1: Dependencias

{Para cada entry en DEPENDENCY_CHANGES[]:}

- [ ] **T-D-{N}** Actualizar `{package_name}` en `{path}` de `{current_version}` a `^{TARGET_VERSION}.0.0`

- [ ] **T-D-LAST** Regenerar lockfile:
  ```bash
  npm install
  ```
````

## Fase 2: Infraestructura y runtime

{Solo si IS_RUNTIME = true:}
{Si .nvmrc existe o debe crearse:}

- [ ] **T-I-001** {Crear | Actualizar} `.nvmrc` con el valor `{TARGET_VERSION}`

{Para cada CI file con nodeVersion a cambiar:}

- [ ] **T-I-002** Actualizar `nodeVersion` en `{CI_FILE}` de `{current}` a `{TARGET_VERSION}.x`

{Para cada Dockerfile con FROM node:X:}

- [ ] **T-I-003** Actualizar imagen base en `{Dockerfile}`:
  ```dockerfile
  # Antes
  FROM node:{current}-alpine
  # Después
  FROM node:{TARGET_VERSION}-alpine
  ```
  _(Ajustar variant según el Dockerfile existente: alpine, slim, bullseye, etc.)_

{Para cada appSettings.json con "Runtime":}

- [ ] **T-I-004** Actualizar `Runtime` en `{appSettings.json}` a `NODEJS_{TARGET_VERSION}_X`

{Si IS*RUNTIME = false:}
*(No aplica para migraciones de librería)\_

## Fase 3: Configuración de build y tests

{Para cada entry en CONFIG_CHANGES[]:}

- [ ] **T-C-{N}** {Descripción concreta del cambio}
      Archivo: `{file}`
  ```
  // Antes
  {current_value}
  // Después
  {target_value}
  ```

{Si CONFIG*CHANGES está vacío:}
*(No se detectaron cambios de configuración necesarios)\_

## Fase 4: Breaking changes en código fuente

{Para cada entry en BREAKING_CHANGES_IN_CODE[]:}

- [ ] **T-S-{N}** [{break_id}] `{severity}` — {description}
      Fix: {fix}
      Archivos afectados:
      {Para cada {file, line_number, snippet}:}
  - `{file}:{line_number}` ({confidence}) — `{snippet}`

{Si BREAKING*CHANGES_IN_CODE está vacío:}
*(No se detectaron breaking changes en código fuente para esta migración)\_

## Fase 5: Breaking changes en tests

{Para cada entry en BREAKING_CHANGES_IN_TESTS[]:}

- [ ] **T-T-{N}** [{break_id}] `{severity}` — {description}
      Fix: {fix}
      Archivos afectados:
      {Para cada {file, line_number, snippet}:}
  - `{file}:{line_number}` ({confidence}) — `{snippet}`

{Si BREAKING*CHANGES_IN_TESTS está vacío:}
*(No se detectaron breaking changes en tests para esta migración)\_

## Fase 6: Verificación

- [ ] **T-V-001** Verificar compilación TypeScript:
  ```bash
  npx tsc --noEmit
  # En monorepos Nx: npx nx affected --target=typecheck
  ```

{Si script "build" en SCRIPTS_AVAILABLE[]:}

- [ ] **T-V-002** Verificar build:
  ```bash
  npm run build
  # En monorepos Nx: npx nx affected --target=build
  ```

{Si script "lint" en SCRIPTS_AVAILABLE[]:}

- [ ] **T-V-003** Ejecutar linter:
  ```bash
  npm run lint
  # En monorepos Nx: npx nx affected:lint
  ```

{Si script "test" en SCRIPTS_AVAILABLE[]:}

- [ ] **T-V-004** Correr suite de tests:
  ```bash
  npm test
  # En monorepos Nx: npx nx affected --target=test
  ```

{Si script "test:ci" en SCRIPTS_AVAILABLE[]:}

- [ ] **T-V-005** Correr tests en modo CI:

  ```bash
  npm run test:ci
  ```

- [ ] **T-V-900** Validar cobertura del escaneo:
  - confirmar conteo de archivos escaneados (source/tests/config)
  - revisar `UNSURE_MATCHES[]` y clasificar cada caso

````

---

## design.md

```markdown
# Design: {LIBRARY} v{TARGET_VERSION} Migration

## Estrategia de migración

{Explicar el enfoque en orden de las fases: primero dependencias (para detectar errores
de compilación antes de tocar código), luego infraestructura, luego config, luego código.
Describir el riesgo principal y cómo se mitiga.}

## Decisiones técnicas

### Rango de versión — `^{TARGET_VERSION}.0.0`

Se usa caret (`^`) en lugar de pin exacto para recibir parches y minor automáticamente,
manteniendo la estabilidad del major. Se evita `>=` para no aceptar accidentalmente el
próximo major con potenciales breaking changes.

### Cambios de configuración

{Para cada CONFIG_CHANGE relevante: explicar el razonamiento técnico.}
{Ej para MIDDY7-001: "Jest necesita transformIgnorePatterns porque @middy v7 publica
ESM puro y Jest por defecto no transpila node_modules. Sin este cambio, los tests
fallan con SyntaxError en el import."}

### Breaking changes — análisis de impacto

{Para cada breaking change encontrado: explicar el impacto técnico y por qué el fix
propuesto es la solución correcta y no un workaround.}

{Si no hay breaking changes: "No se detectaron breaking changes en este repositorio
para esta migración. El riesgo es bajo."}

### Compatibilidad del ecosistema

{Mencionar dependencias relacionadas que pueden verse afectadas.}
{Ej para Middy v7: listar middlewares de terceros y su estado de compatibilidad con v7.}
{Si no aplica: "No se identificaron dependencias del ecosistema con riesgo de incompatibilidad."}

### Calidad del análisis

- Cobertura: {source_files_scanned} source, {test_files_scanned} tests, {config_files_scanned} config
- Matches de alta confianza: {N}
- Matches de media confianza: {N}
- Matches de baja confianza: {N}
- Estrategia de revisión manual para baja confianza: {criterio aplicado}

## Tabla de cambios

| Archivo | Campo / Patrón | Antes | Después |
|---------|----------------|-------|---------|
{Una fila por cada cambio concreto en DEPENDENCY_CHANGES[], CONFIG_CHANGES[],
BREAKING_CHANGES_IN_CODE[] y BREAKING_CHANGES_IN_TESTS[]}

## Referencias

- {DOCS_URL si está disponible}
- {Links adicionales encontrados durante el análisis}
- Knowledge base interna consultada: {lista de break_ids relevantes de known-breaks.md}
````
