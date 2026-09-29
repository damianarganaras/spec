# Design: migrate-openspec-to-aspec

## Contexto

Estado actual confirmado contra el código:

- `CHANGES_ROOT = 'aspec'` (`src/cli/index.js:763`).
- `scaffoldAspec(projectDir)` (`:770-777`) crea `aspec/changes/` y, sólo si no existe, escribe
  `aspec/config.yaml` (nunca pisa un config previo).
- Migración legacy **sólo en `upgradeCmd`** (`:986-993`): `rename(openspec → aspec)` si `aspec/` no
  existe; si ambas existen, advierte y no migra. `upgrade` exige `.ancletorc` (`:981-985`).
- `initProject` llama `scaffoldAspec` en `:1087`, **después** de `copyTemplates` y sin detección
  legacy.
- `install --project` también llama `scaffoldAspec` (`:930-933`), fuera de scope.
- Imports ya disponibles (`:3`): `cp`, `mkdir`, `readFile`, `readdir`, `rename`, `existsSync`… →
  `cp` recursivo no requiere dependencias nuevas.
- Red de tests existente: `test/cli.test.js:434-462` (migración upgrade + no-pisar). El test `:442`
  asume que `openspec/` desaparece; debe actualizarse al comportamiento por copia.

## Decisiones

### D1 — Helper compartido, ejecutado antes del scaffold

Extraer `migrateLegacyOpenspec(projectDir)` como única dueña del invariante, invocada desde
`initProject` (antes de `scaffoldAspec`, `:1087`) y desde `upgradeCmd` (reemplaza el bloque
`:986-993`). Motivo: un solo lugar decide detección/copia/aviso; evita duplicar la guarda en dos
entry points y satisface el requisito de orden (la migración precede al scaffold).

### D2 — Copia recursiva en vez de `rename`

Usar `cp(join(projectDir, 'openspec'), join(projectDir, 'aspec'), { recursive: true, force: false })`.
Con `errorOnExist` en su default (`false`), la copia **fusiona** directorios y **omite** archivos ya
presentes en el destino → preserva `aspec/config.yaml` y la estructura scaffold, y agrega lo
faltante. `openspec/` no se toca (no hay `rename`, no hay borrado). Al completar exitosamente la
copia se escribe el marcador `aspec/.migrated-from-openspec` (ver D5). Alternativa `rename`
descartada: destructiva y sin backup (decisión de producto aprobada).

### D3 — Definición operativa y testeable de "contenido real" de `aspec/`

Predicado `hasRealContent(aspecDir)`, calculado **antes** del scaffold:

- **NO real (sólo scaffold):** `aspec/` inexistente; o sólo contiene `config.yaml` y/o
  `aspec/changes/` vacío; o `aspec/specs/` inexistente/vacío.
- **Real:** existe al menos una entrada bajo `aspec/changes/` (cualquier change) **o** contenido bajo
  `aspec/specs/` (cualquier spec).

`config.yaml` por sí solo **no** cuenta como real. Implementación: `readdir` de
`aspec/changes` y `aspec/specs` cuando existan; real si cualquiera tiene ≥1 entrada. Decisión
conservadora: cualquier entrada bajo `changes/` (aunque sea un dir vacío) cuenta como real, para no
pisar intención del usuario.

### D4 — Ramificación y salida

1. Sin `openspec/` → no-op silencioso.
2. `openspec/` existe y `aspec/` no tiene contenido real → copia (D2) + reporte:
   `ancleto: contenido migrado de openspec/ a aspec/ (openspec/ se conserva como backup)`.
3. `openspec/` existe, `aspec/` tiene contenido real **y no existe el marcador
   `aspec/.migrated-from-openspec`** → no tocar nada + `console.warn`:
   `ancleto: aspec/ ya tiene contenido real — no se migro openspec/ (revisar manualmente; openspec/ se conserva)`.
4. Existe el marcador `aspec/.migrated-from-openspec` → no-op silencioso (ver D5).

Luego corre `scaffoldAspec` como siempre (idempotente; no pisa config existente).

### D5 — Idempotencia basada en el marcador `aspec/.migrated-from-openspec`

El marcador se escribe **al final** de la copia exitosa (D2), de modo que su presencia significa
"esta `aspec/` ya fue migrada desde `openspec/`". Con el marcador presente, cualquier corrida
posterior es una **no-op silenciosa**: no recopia, no advierte y no falla (exit 0), sin quedar
atrapada en la rama 3 de D4 aunque `openspec/` siga existiendo como backup y `aspec/` tenga
contenido real. Esto resuelve O1 (aviso repetido) sin comparar árboles: el marcador es un flag
barato y determinista. El orden importa: la guarda del marcador se evalúa **antes** de la
ramificación de D4.

### D6 — Reutilización del código legacy de `upgrade`

El bloque `:986-993` se reemplaza por la llamada al helper. El cambio de comportamiento (rename→copia,
conservar `openspec/`) es intencional y documentado en el delta. No se toca `CHANGES_ROOT`,
`scaffoldAspec` ni el layout de `aspec/`.

### D7 — Red de tests

Reescribir/ampliar `test/cli.test.js:434-462`:

- Migración preserva contenido **y** conserva `openspec/` (reemplaza la aserción `:442`) y deja el
  marcador `aspec/.migrated-from-openspec`.
- `aspec/` sólo-scaffold → migra encima, `config.yaml` intacto.
- `aspec/` con contenido real **y sin marcador** → sin cambios + advertencia.
- Idempotencia: con el marcador presente, la segunda corrida es **silenciosa** (sin recopia, sin
  advertencia, exit 0). Escenario: "segunda corrida tras migrar: silenciosa".
- Añadir caso `init` con `openspec/` pre-existente (hoy sólo se cubre `upgrade`).

## Open questions / risks

- **O1 — Aviso repetido: RESUELTO por marcador.** El marcador `aspec/.migrated-from-openspec`
  (D5) convierte las corridas posteriores en no-op silenciosa; no se compara el árbol.
- **O2 — `install --project`** (también llama `scaffoldAspec`, `:930-933`) sigue **fuera de scope**
  de este change: se registra en **BACKLOG**, no se resuelve acá.
- **O3 — Semántica de `cp` con `force:false` en Windows: CERRADO sin cambios.** Se mantiene la
  asunción de fusión + omisión de existentes; el test de scaffold-only lo verifica. Fallback si el
  runtime difiere: copiar entry-wise saltando `config.yaml`.
- **O4 — Heurística de "real": CERRADO sin cambios.** Se mantiene "cualquier entrada bajo
  `changes/` cuenta como real" (conservador). Si generara falsos "contenido real" tras un scaffold,
  ajustar a "≥1 archivo recursivo".
- **Confirmación interactiva: nunca pregunta.** La migración no tiene prompt; sólo reporta por
  salida estándar (compatible con no-TTY/CI).

## Non-goals

- Sin comando separado de migración.
- Sin tocar `install --project`, `CHANGES_ROOT`, `scaffoldAspec` ni el layout de `aspec/`.
- Sin migrar `.ancleto/` ni memoria; sólo la carpeta legacy `openspec/`.
- O2 (alcance a `install --project`) se registra en BACKLOG, no se resuelve en esta iteración.

## Nota sobre el contexto de origen

Contexto sin Work Item asociado (Azure DevOps deshabilitado). Hallazgos confirmados contra
`src/cli/index.js` (`scaffoldAspec`, `upgradeCmd`, `initProject`), `test/cli.test.js:434-462` y
`aspec/specs/` (única spec activa: `memory-engine`).
