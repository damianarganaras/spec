# Tareas: Dynamic Frontmatter Adapters

## Implementación

- [x] **T1: Crear módulo `src/core/adapters/frontmatter.js`**
  - Mover `parseFrontmatter`, `serializeFrontmatter`, `AGENT_ADAPTER_HOSTS`, `AGENT_ADAPTER_DROP`,
    `ANTIGRAVITY_TOOL_MAP`, `parseToolFlags`, `frontmatterValue`, `adaptAntigravityFrontmatter`,
    `adaptFrontmatter` desde `src/cli/index.js` al nuevo módulo.
  - Exportar `adaptFrontmatter` como función pública.
  - Re-exportar `parseFrontmatter` y `serializeFrontmatter` si otro punto del CLI las usa.
  - Agregar rama para `cursor`/`roo`: identity + `console.error` con aviso
    (`no documented frontmatter adaptation for host 'X'`).
  - Agregar rama para host desconocido: identity + `console.error`
    (`unknown agent 'X', passthrough`).

- [x] **T2: Actualizar `src/cli/index.js` para importar desde el módulo**
  - Reemplazar las definiciones locales por `import { adaptFrontmatter } from '../core/adapters/frontmatter.js'`.
  - Verificar que `copyDirTransformed`, `installAssetFiles`, `adaptAntigravityFrontmatter` (si se usa
    fuera del adapter) funcionen con el import.
  - Eliminar el código movido (funciones, constantes, comentarios de sección).

- [x] **T3: Extender `ancleto check` para validar frontmatter de agents**
  - En `checkCommand()`, después de validar presencia de archivos, para cada `.md` en directorios de
    agents: leer contenido instalado, leer origen, aplicar `adaptFrontmatter(origen, host, 'agents', name)`,
    comparar.
  - Reportar divergencia como warning (⚠), no como faltante (✖).
  - Exit code no cambia por divergencias de frontmatter.
  - Derivar el `host` de cada directorio de agents usando `installedHostsFromPaths` (ya existe).

- [x] **T4: Tests unitarios del módulo adaptador**
  - Crear `test/adapters-frontmatter.test.js`.
  - Casos:
    - Identity para opencode (agents y skills, byte-a-byte).
    - Drop de `mode/color/temperature/permission/model/tools` para claude/vscode/copilot agents.
    - Transformación completa antigravity agents (name inyectado, tools como lista, model: inherit,
      mainAgent/subagent, omisión con aviso de tools sin id verificado).
    - Passthrough + warning para cursor/roo (agents y skills).
    - Passthrough + warning para host desconocido.
    - Sin frontmatter → content sin cambios.
    - Skills no se adaptan para ningún host (identity).

## Validación

- [x] **T5: Validación manual de integración**
  - `node --test test/*.test.js` — todos los tests pasan (incluyendo los nuevos).
  - `ancleto init --agent opencode` + `ancleto check` → 0 faltantes, 0 huerfanos, 0 divergencias.
  - `ancleto init --agent antigravity` + `ancleto check` → idem.
  - `ancleto init --agent cursor` + `ancleto check` → idem, con aviso stderr de frontmatter no adaptado.
  - `ancleto upgrade --agent vscode` → re-aplica adaptador, check pasa.
  - Editar manualmente un frontmatter de agent instalado → `ancleto check` reporta divergencia (⚠).

## Cierre

- [ ] **T6: Actualizar spec source-of-truth**
  - Sync delta spec a `aspec/specs/skill-frontmatter-adapters/spec.md` (archive).
