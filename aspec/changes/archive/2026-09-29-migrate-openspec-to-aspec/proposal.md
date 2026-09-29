# Proposal: Migración automática de `openspec/` legacy a `aspec/` en los scripts de inicio

## Problem

Un proyecto que usaba `openspec` **antes** de adoptar Ancleto tiene una carpeta `openspec/` en su
raíz. Al incorporar el framework, el primer comando que ejecuta es `ancleto init` (todavía no
existe `.ancletorc`). Hoy `init` **no detecta ni migra** esa carpeta legacy: sólo llama
`scaffoldAspec` (`src/cli/index.js:1087`), que crea `aspec/changes/` y `aspec/config.yaml`
(`src/cli/index.js:770-777`, `CHANGES_ROOT = 'aspec'` en `:763`). Resultado: los specs y changes
del proyecto quedan en `openspec/`, invisibles para el flujo aspec, y el scaffold crea un `aspec/`
paralelo.

La migración legacy existe, pero **sólo dentro de `upgrade`** (`src/cli/index.js:986-993`):
renombra `openspec/` → `aspec/` si `aspec/` no existe, y si ambas existen avisa y no migra. Como
`upgrade` exige `.ancletorc` (`:981-985`), el caso de uso real (proyecto que llega con `openspec/`
pre-existente y corre `init` primero) queda sin cubrir. Peor: como `init` ya creó `aspec/` vía
scaffold, un `upgrade` posterior cae en la rama de coexistencia y **aborta** la migración.

El comportamiento del upgrade actual está cubierto por tests (`test/cli.test.js:434-462`), pero no
existe fuente-de-verdad en `aspec/specs/`: la única spec activa es `memory-engine`.

## Proposed change

Llevar la detección y migración legacy a **ambos scripts de inicio** (`init` y `upgrade`), como
paso automático y no interactivo, ejecutado **antes** del scaffold de `aspec/`:

1. **Detectar** `openspec/` en la raíz del proyecto, sin comando separado ni entrada del usuario.
2. **Migrar** el contenido completo por **copia recursiva** (no `rename`) a `aspec/` cuando `aspec/`
   no existe **o no tiene contenido real** (sólo scaffold), preservando subdirectorios y archivos, y
   reportarlo en la salida. La copia no pisa de forma destructiva el `config.yaml` ni la estructura
   ya presente en `aspec/`.
3. **Conservar `openspec/` como backup**: tras migrar, `openspec/` permanece en la raíz y convive con
   `aspec/`. El comando nunca la elimina; borrarla queda a decisión del usuario.
4. **Coexistencia con contenido real**: si `aspec/` ya existe **con contenido real**, no tocar
   ninguna carpeta, conservar `openspec/` y emitir advertencia de revisión manual.
5. **Orden**: correr la migración antes de `scaffoldAspec`, para que el scaffold no cree `aspec/` y
   bloquee la detección.

Se formaliza esta conducta como una capability nueva `aspec-bootstrap` (no existía spec para el
bootstrap/scaffold de `aspec/`).

## Scope

In scope:

- `src/cli/index.js` — `initProject` y `upgradeCmd`: detección + migración legacy común, ejecutada
  antes de `scaffoldAspec`. El `upgrade` deja de renombrar y pasa a copiar conservando `openspec/`
  como backup.
- Nuevo delta spec `specs/aspec-bootstrap/spec.md` con los requirements del bootstrap legacy.
- (Stage posterior) tests que cubran `init` con `openspec/` pre-existente.

Out of scope (no-goals):

- **No** se crea un comando separado de migración (acordado: el punto de detección es el script de
  inicio).
- **No** se toca `install --project`, aunque también llama `scaffoldAspec` (`:930-933`). Queda como
  open question.
- **No** se modifica `CHANGES_ROOT`, `scaffoldAspec` ni el layout de `aspec/`.
- **No** se migra contenido de `.ancleto/` ni de memoria; sólo la carpeta legacy `openspec/`.

## Risks

- **Orden vs scaffold:** si la migración corre después de `scaffoldAspec`, `aspec/` ya existe y la
  detección aborta. Mitigación: el requirement fija que detección y migración preceden al scaffold.
- **`openspec/` de herramienta externa con layout/schema distinto:** una copia wholesale lo
  preserva bajo `aspec/`, pero su `config.yaml` legacy podría no tener el schema aspec. Mitigación:
  la copia no pisa un `config.yaml` existente y `scaffoldAspec` tampoco (`:774`); se documenta como
  assumption.
- **Duplicación de fuentes de verdad:** al conservar `openspec/` como backup, conviven dos copias y
  el usuario podría editar la equivocada. Mitigación: la migración es por copia (no destructiva), el
  comando reporta explícitamente que `openspec/` se conserva como backup y su borrado queda a
  decisión del usuario.
- **Copia sobre scaffold:** copiar `openspec/` sobre un `aspec/` recién scaffoldeado no debe pisar
  `config.yaml` ni la estructura. Mitigación: la copia preserva los archivos existentes de `aspec/`
  y sólo agrega los faltantes; `scaffoldAspec` ya no reescribe un `config.yaml` existente (`:774`).
- **Aviso repetido tras migrar:** como `openspec/` se conserva, una segunda corrida caería en la rama
  de coexistencia. Mitigación: al completar la copia se escribe el marcador
  `aspec/.migrated-from-openspec`; con el marcador presente la corrida es una no-op silenciosa (no
  recopia, no advierte, no falla). La advertencia de coexistencia queda reservada a `aspec/` con
  contenido real **y sin marcador**.
- **Falsos positivos:** una carpeta `openspec/` gitignoreada o vacía podría disparar la detección.
  Mitigación: la detección se basa sólo en la existencia en disco de la carpeta.
- **Regresión del upgrade:** el comportamiento actual (`rename` / aviso) cambia a copia + backup y los
  tests asumen que `openspec/` desaparece (`test/cli.test.js:442`). Mitigación: se actualizan los
  tests `test/cli.test.js:434-462` al comportamiento por copia.

## Open Questions and Assumptions

Assumptions (propuestas, a confirmar):

- La estructura de `openspec/` es compatible con `aspec/` (mismo layout `changes/`, `specs/`,
  `config.yaml`), por eso se migra la carpeta completa y no un subconjunto.
- La migración es por **copia**: `openspec/` se conserva como backup y ambos conviven tras migrar
  (decisión aprobada). El comando nunca elimina `openspec/`.
- La migración es silenciosa y no interactiva: sólo reporta por salida estándar (compatible con
  terminal no-TTY/CI), alineado con "sin intervención manual".
- "Contenido real" de `aspec/` significa contenido más allá del scaffold (`config.yaml` y/o
  `changes/` vacío); una `aspec/` sólo-scaffold no bloquea la migración.

Open questions (decisiones de producto materiales):

1. ~~Eliminar vs conservar `openspec/`~~ **Resuelto:** copiar y conservar `openspec/` como backup;
   el comando no la borra.
2. ~~Merge vs abort en coexistencia~~ **Resuelto:** abortar (sin tocar ninguna carpeta) sólo cuando
   `aspec/` tiene contenido real **y sin el marcador** `aspec/.migrated-from-openspec`; si es sólo
   scaffold, se migra encima.
3. ~~`aspec/` existente pero vacío~~ **Resuelto:** se define "contenido real" y se migra encima del
   scaffold sin pisar `config.yaml`.
4. **Alcance a `install --project`** — **fuera de scope** de este change; se registra en **BACKLOG**
   (no se resuelve acá).
5. ~~Confirmación interactiva~~ **Resuelto:** nunca preguntar; reporta por salida estándar.
6. ~~Aviso repetido tras migrar~~ **Resuelto por marcador:** la copia exitosa escribe
   `aspec/.migrated-from-openspec`; con el marcador presente, una corrida posterior es no-op
   silenciosa (ver `design.md` D5).

## Nota sobre el contexto de origen

Contexto producido sin Work Item asociado (Azure DevOps deshabilitado en `.ancletorc`). Los
hallazgos se confirmaron contra el código real: `src/cli/index.js` (`scaffoldAspec`, `upgradeCmd`,
`initProject`), `test/cli.test.js:434-462` y `aspec/specs/` (única spec activa: `memory-engine`).
