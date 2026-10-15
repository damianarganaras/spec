# Design: Contrato de validaciones declarativo por proyecto

## Approach

El change aplica el mismo principio de **ownership único** ya vigente en `prompt-contracts`: cada regla
vive en una sola superficie canónica y el resto la referencia. Aquí la regla es el **contrato de
validaciones**, y la fuente canónica es **el propio proyecto**, que declara sus comandos en
`PRODUCT.md` → `## Project Commands`. Los prompts del framework dejan de nombrar herramientas concretas
(Prettier, ESLint, `typecheck`) y pasan a leer lo declarado; lo que no está declarado **no se asume**.

Convenciones del repo que condicionan el diseño:

- **zero-deps de runtime**: el change es solo texto de prompts y tests; no agrega dependencias.
- **multi-host** (`opencode` default, `claude`, `copilot`, `antigravity`): ninguna instrucción
  host-específica en texto compartido. La política es host-neutral.
- `test/content-guards.test.js` fija contratos de prompt → **se actualiza en el mismo change**.
- El mecanismo de bloques `LOCKED` (`src/cli/index.js:1274-1327`) re-aplica el contenido en
  `install`/`upgrade`, insertando bloques nuevos en el ancla que da el orden del template. La política
  nueva debe vivir en un bloque `LOCKED` para propagarse. **Límite**: ese merge sólo toca bloques
  `LOCKED`; el texto plano no se reconcilia (ver §8).

## Architecture

### 1. `templates/AGENTS.md` — bloque `LOCKED: validation-commands`

Reemplazar la lista fija de `:22-25`:

```
- **Validaciones obligatorias antes de cerrar una tarea**:
  - `npm run typecheck` o `npx tsc --noEmit`
  - `npm run lint`
  - `npm test`
```

por una política **declarativa**, dentro de un bloque `LOCKED: validation-commands`:

- Correr **solo** lo que el proyecto declare en `PRODUCT.md` → `## Project Commands`.
- Si un comando no está declarado: **saltearlo y registrar la omisión**; **nunca inventarlo** ni asumir
  un runner/formatter/herramienta.
- **Format check**: corre solo si el proyecto declara un formatter; si no, se reporta `not-configured`.
- **Tests**: por el comando declarado (p. ej. `npm test`) o con **rutas explícitas**; **nunca**
  `node --test` pelado (arrastra artefactos vendored/fuera de la suite).

El bloque se ubica como **primer** bloque `LOCKED` del archivo. Con eso, en proyectos con un `AGENTS.md`
local que aún no lo tiene, `findInsertAnchor` (`src/cli/index.js:1319-1327`) lo inserta antes de
`LOCKED: memory-boundary`, sin duplicar ni tocar el resto. El texto es host-neutral: no nombra ningún
host ni tool de host. **Pero** el merge sólo entiende bloques `LOCKED`: si un `AGENTS.md` existente aún
tiene la lista plana vieja, ésta **no** se elimina por sí sola — se necesita la reconciliación de §8.

### 2. `PRODUCT.md` — declaración real de comandos

- Corregir `:115`, que afirma que no hay scripts npm: los scripts `lint` y `test` **sí** existen
  (`package.json:33-36`).
- En `## Project Commands` (`PRODUCT.md:113-118`) declarar los valores reales:
  - **Lint**: `npm run lint` (`eslint src/ test/`, flat config `eslint.config.js`).
  - **Tests**: `npm test` (`node --test "test/*.test.js"`) o rutas explícitas para archivos puntuales.
  - **Typecheck**: no aplica (paquete JavaScript, sin `tsconfig.json`).
  - **Format**: no configurado (`not-configured`) — el repo no declara formatter.
- Mantener la nota de invocación acotada (nunca `node --test` pelado) y el aviso de discrepancia con las
  validaciones genéricas del template (ahora resuelto por la política declarativa).

### 3. `agents/coder.md` — usar el comando declarado

- `:95`: reemplazar "compatible with the repository's Prettier rules" por "compatible con el formatter
  declarado por el proyecto (si lo hay); si no hay formatter declarado, el format check es
  `not-configured`". Se conserva la conducta: no correr formateadores, dejar format/lint/tests al tester.
- `:117`: reemplazar "Prettier formatting and relevant ESLint rules" por "el formatter y linter
  declarados por el proyecto (ver `PRODUCT.md` → `## Project Commands`); si no hay formatter, es
  `not-configured`".

### 4. `agents/tester.md` — usar el comando declarado y `not-configured`

- `:133`: "Run the repository's Prettier check without `--write`" → "correr el **format check declarado**
  por el proyecto (si lo hay) sin `--write`, y luego el **lint declarado**, una vez sobre el conjunto de
  task-owned files". Si no hay formatter declarado, el format check es `not-configured` (no un fallo).
- `:145`: idem `:117` para test files.
- `:151`: "do not run Prettier with `--write`" → "no correr el formateador declarado con `--write` ni
  editar silenciosamente archivos de producción".
- Se preservan intactos: prioridad de verificación (cambio → afectados → suite), Validation Ledger,
  clasificación de fallos (`passed`/`task-regression`/`pre-existing-unrelated`/`inconclusive`) y el
  manejo de snapshots.

### 5. `skills/ancleto-upgrade/references/templates.md` — verificación referenciada

La plantilla emite la verificación de un change de migración en dos lugares:

- **Spec** (`:89-95`): hoy fija `REQ-V-001` (compile sin errores de **TypeScript**), `REQ-V-002` (pasar
  los tests) y `REQ-V-003` (pasar lint), con gating sólo para lint. Se reemplaza por verificación
  **referenciada**: cada `REQ-V-*` referencia el comando declarado por el proyecto en `PRODUCT.md` →
  `## Project Commands` y se emite sólo si ese comando está declarado (el typecheck incluido, si aplica).
- **Tasks** (`:170-198`): hoy fija `npx tsc --noEmit` (T-V-001, **incondicional**), `npm run build`,
  `npm run lint`, `npm test` y `npm run test:ci`, con gating `only when the script exists` que cubre
  T-V-002..T-V-005 pero **no** T-V-001. Se alinea todo a "declarado por el proyecto": el typecheck deja
  de ser incondicional y cada tarea se emite sólo si el proyecto declara su comando.

Nx y otros runners quedan como variantes ilustrativas que sólo aplican si el proyecto los declara; el
texto no fija un comando concreto como obligatorio.

### 6. `skills/ancleto-pr/SKILL.md` — Test Plan por comando declarado

- `:79`: reemplazar `- [ ] Unit tests pass (\`npm test\`)` por una entrada que use el comando de test
  declarado por el proyecto (placeholder sustituido al generar el PR, referenciando `PRODUCT.md` →
  `## Project Commands`). El resto del checklist no depende de un comando concreto.

### 7. `test/content-guards.test.js` — asserts de comportamiento

Nuevo bloque de guards que fija el **comportamiento** (no la redacción literal):

- `templates/AGENTS.md` contiene `LOCKED: validation-commands` y la política declarativa (keywords
  `PRODUCT.md`, `## Project Commands`, `not-configured`, "nunca inventar"/`never invent`).
- `templates/AGENTS.md` **no** fija `npm run typecheck` ni un formatter concreto como obligatorio.
- `agents/coder.md` y `agents/tester.md` **no** hardcodean Prettier/ESLint
  (`assert.doesNotMatch(/Prettier/)`) y **referencian** los comandos declarados (`PRODUCT.md` /
  `## Project Commands`).
- `skills/ancleto-upgrade/references/templates.md` **no** fija un typecheck incondicional ni comandos npm
  concretos, y **referencia** los comandos declarados.
- `skills/ancleto-pr/SKILL.md` **no** fija `npm test` y **referencia** el comando declarado.
- Se conservan sin cambios los guards de las salvaguardas intocables (orquestador/reviewer/spec-writer
  `bash:false`, cinco flags, Validation Ledger, bloqueo por CRITICAL).

### Fuente canónica de las superficies de skill

La fuente canónica es `skills/` (raíz), que es lo que el CLI publica/copia y lo que leen los guards
(`test/content-guards.test.js`). La copia instalada `.opencode/skills/` es dogfooding y se regenera en
`install`/`upgrade`: no se edita a mano.

### Overlap y secuencia con `token-budget`

`token-budget` (archivado `2026-10-14-token-budget/`) ya tocó `templates/AGENTS.md` y
`test/content-guards.test.js`; dejó en `templates/AGENTS.md` los bloques `LOCKED: artifacts-language` y
`LOCKED: seed-freshness` como fuente única, y creó `aspec/specs/prompt-contracts/spec.md`. Este change
**construye sobre ese estado** (no lo re-decide). Los dos archivos compartidos obligan a **secuenciar**
los changes: `token-budget` primero (ya archivado), este después; no mergear en paralelo. Queda asentado
en `tasks.md`.

### Salvaguardas intocables (restricción de diseño)

Ninguna parte de este change elimina ni degrada: Validation Ledger y los cinco flags (`SPEC UPDATE
RECOMMENDED`, `SEED_ACTION_REQUIRED`, `GUARANTEE NOT SUSTAINED`, task-owned files, ledger), bloqueo por
CRITICAL, `bash:false` en reviewer/orchestrator/spec-writer, verificación de garantías bajo modelo real,
verificación de afectados y baseline reproducible. Los guards de comportamiento que las cubren se
mantienen.

### 8. Reconciliación de bloques legados en `install`/`update`/`upgrade` e `import` (hallazgo material)

**Problema.** Las rutas que mergean los templates raíz (`TEMPLATES = ['AGENTS.md', 'PRODUCT.md']`,
`src/cli/index.js:24`) delegan en `mergeLocked`, que **reemplaza/inserta sólo bloques `LOCKED`**. El texto
plano no tiene marcadores, así que es inmune al merge. Esto afecta a **toda ruta que invoca `mergeLocked`
sobre `TEMPLATES`**: `install`/`update`/`upgrade` (vía `copyTemplates`, `:1392`) **e** `import`
(`importCmd`, `:2834`, merge en `:2896`). Prueba en el propio repo: `AGENTS.md:22-25` conserva la lista
plana vieja; sobre un `AGENTS.md` así, `findInsertAnchor` (`:1317-1327`) inserta
`LOCKED: validation-commands` antes de `memory-boundary` (`:53`) y la lista vieja **sigue ahí** →
coexistencia de guía vieja y nueva. La premisa "se regenera" vale para `.opencode/skills/` (copia entera)
pero **no** para `AGENTS.md` (merge por bloques).

**Mecanismo (dos partes).**

1. **Fuente canónica envuelta como bloque**: `templates/AGENTS.md` ya envuelve la política en
   `<!-- LOCKED: validation-commands -->` y **no** contiene la lista plana (verificado). Las
   instalaciones frescas nacen limpias.
2. **Migración explícita de bloques legados en un punto único**: el helper
   `mergeTemplateInto(source, local, filename)` (`src/cli/index.js:1385`) es el **punto único** que ejecuta
   la reconciliación **antes** de `mergeLocked` (`:1386`) y lo invocan **todas** las rutas que mergean
   `TEMPLATES`: `copyTemplates` (`:1402`) e `importCmd` (`:2896`). No existe ruta que mergee sin
   reconciliar. La reconciliación recorre una tabla declarativa de **firmas legadas**
   `{ id, pattern, replacement }` (`reconcileLegacyBlocks`, `:1350`) y, por cada coincidencia **exacta**,
   elimina el bloque plano legado. Hoy la tabla tiene una entrada: la lista vieja de validaciones (heading
   `**Validaciones obligatorias antes de cerrar una tarea**:` + sus ítems `npm run typecheck`/`npx tsc
   --noEmit`, `npm run lint`, `npm test`), con reemplazo **vacío**. Después, `mergeLocked` inserta el
   bloque canónico en el ancla.

**Contrato de seguridad.**

- **Seguro**: elimina sólo cuando la firma coincide exactamente (tolerando `\r\n` y espaciado). Si el
  bloque fue personalizado o no coincide, **no se toca**: emite un aviso
  (`bloque legado de validaciones no reconocido; revisar`) y conserva el contenido. Nunca borra fuera del
  bloque identificado.
- **Idempotente**: tras la eliminación la firma ya no está; re-ejecutar no cambia el archivo. Sumado a la
  idempotencia de `mergeLocked`, el resultado es estable (a lo sumo, un write cuando el contenido cambió,
  porque cada ruta ya compara `merged !== local`).
- **Multi-host y zero-deps**: corre en el CLI (host-agnóstico) usando `node:fs` y regex ya presentes; no
  agrega dependencias ni texto host-específico.
- **Resultado**: no coexisten la guía vieja y la nueva; el update deja el proyecto coherente **sin pasos
  manuales** (requisito del usuario).

**`PRODUCT.md` (si aplica).** `PRODUCT.md` también se mergea por bloques, pero es EXTENSIBLE y nunca se
reemplaza una vez creado. No aloja una lista plana de validaciones gestionada por el framework, así que
la tabla de firmas **no tiene entrada para él**: la reconciliación es un no-op hoy. El mecanismo queda
listo para registrar firmas legadas de `PRODUCT.md` si en el futuro aparece una.

**Por qué no un reemplazo total.** Reemplazar `AGENTS.md` entero rompería el contrato EXTENSIBLE y el
contenido personalizado del usuario; la migración por firma es la opción mínima que resuelve la
coexistencia sin degradar la seguridad del merge.

### 9. Correcciones menores aprobadas

- `PRODUCT.md:20`: el conteo "7 archivos de suite" está stale; la suite real son **10** archivos
  (`test/*.test.js`, verificado). Alinear a 10 (o remitir a `## Project Commands`).
- `PRODUCT.md:94`: duplica la lista de validaciones (`npm run lint`/`npm test`) teniendo
  `## Project Commands` como fuente única; dejar **sólo la referencia** a `## Project Commands` y al
  bloque LOCKED `validation-commands`.
- `skills/ancleto-upgrade/references/templates.md:175`: la nota entre paréntesis mantiene
  `npx nx affected --target=<target>` literal; usar "el target declarado". Requiere actualizar el guard
  `test/content-guards.test.js:554` (hoy asserta `/npx nx affected/`) para asertar la **condición**
  ("only when declared" / declared target) en vez del literal.

## Validation

- **Guards**: `node --test test/content-guards.test.js` en verde, incluyendo los asserts nuevos, los de
  las superficies de skill (upgrade/pr) y los de salvaguardas.
- **Lint**: `npm run lint` (comando declarado del repo) en verde.
- **Regresión**: suite completa `npm test` (`node --test "test/*.test.js"`) en verde; usar rutas
  explícitas para los archivos puntuales, nunca `node --test` pelado.
- **No host-específico**: confirmar que ningún asset compartido gana texto host-específico (la política
  es host-neutral).
- **No breaking**: verificar que el bloque `LOCKED` nuevo se re-aplica/inserta en `install`/`upgrade` sin
  tocar el resto del `AGENTS.md` local.
- **Upgrade/import de instalación existente**: sobre un `AGENTS.md` pre-change con la lista plana vieja,
  `upgrade` **e** `import` dejan el archivo **sin** la lista plana y **con** el bloque
  `LOCKED: validation-commands`, sin duplicar y preservando el resto; re-ejecutar es idempotente; una firma
  personalizada no se elimina y emite el aviso (§8). Ambas rutas pasan por el punto único
  `mergeTemplateInto`, así que `test/cli.test.js` cubre upgrade e import.
