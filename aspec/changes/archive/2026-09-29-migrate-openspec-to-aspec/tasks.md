# Tasks: migrate-openspec-to-aspec

## 1. Implementación

- [x] 1.1 En `src/cli/index.js`, junto a `scaffoldAspec` (`:770`), agregar el predicado
  `hasRealContent(aspecDir)`: real si `aspec/changes/` o `aspec/specs/` tienen ≥1 entrada;
  `config.yaml` solo no cuenta. Cubrir el caso `aspec/` inexistente.
- [x] 1.2 Agregar el helper `migrateLegacyOpenspec(projectDir)`: si no existe `openspec/`, no-op; si
  existe el marcador `aspec/.migrated-from-openspec`, no-op silenciosa (sin recopiar, sin advertir,
  sin fallar); si `aspec/` no tiene contenido real, copiar recursivamente con
  `cp(openspec, aspec, { recursive: true, force: false })`, escribir el marcador
  `aspec/.migrated-from-openspec` al final y reportar migración; si `aspec/` tiene contenido real y
  no existe el marcador, no tocar nada y advertir revisión manual (ver design D2/D4/D5).
- [x] 1.3 Invocar `migrateLegacyOpenspec(projectDir)` en `initProject` **antes** de
  `scaffoldAspec(projectDir)` (`:1087`).
- [x] 1.4 Reemplazar el bloque legacy de `upgradeCmd` (`:986-993`) por la llamada a
  `migrateLegacyOpenspec(projectDir)`, conservando la exigencia previa de `.ancletorc`.
- [x] 1.5 Verificar que `scaffoldAspec` sigue sin pisar `aspec/config.yaml` cuando la copia ya dejó
  uno presente; ajustar la salida/reporte del comando si hace falta.

## 2. Tests

- [x] 2.1 Actualizar `test/cli.test.js:434-462`: el caso de migración debe afirmar que el contenido
  queda en `aspec/` **y** que `openspec/` se conserva como backup (reemplaza la aserción `:442`).
- [x] 2.2 Actualizar el caso de coexistencia a "`aspec/` con contenido real": `aspec/` sin cambios,
  `openspec/` intacta y advertencia en `stderr`.
- [x] 2.3 Nuevo test: `aspec/` sólo-scaffold (`changes/` vacío + `config.yaml`) → migra encima,
  contenido copiado y `config.yaml` previo intacto.
- [x] 2.4 Nuevo test de idempotencia: segunda corrida tras migrar (marcador presente) es silenciosa
  — no recopia, no advierte (sin `stderr` de advertencia), exit 0, y conserva `aspec/` y `openspec/`.
- [x] 2.5 Nuevo test: `init` con `openspec/` pre-existente migra por copia antes del scaffold.

## 3. Validaciones del repositorio

- [x] 3.1 `node --check src/cli/index.js` (chequeo de sintaxis del archivo modificado).
- [x] 3.2 `node --check test/cli.test.js` (chequeo de sintaxis del test modificado).
- [x] 3.3 `node --test test/cli.test.js` (suite afectada; alternativa suite completa: `node --test`).
