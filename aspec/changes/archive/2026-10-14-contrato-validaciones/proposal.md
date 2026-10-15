# Proposal: Contrato de validaciones declarativo por proyecto

## Problem

Las validaciones están **hardcodeadas en los prompts** en lugar de declararse por proyecto, así que cada
proyecto usuario hereda supuestos que pueden no existir en su tooling real:

- `templates/AGENTS.md:22-25` fija como obligatorias `npm run typecheck` (o `npx tsc --noEmit`),
  `npm run lint` y `npm test`, sin consultar qué declara el proyecto.
- `agents/tester.md:133,145,151` asume un format check de **Prettier** y reglas **ESLint**.
- `agents/coder.md:95,117` referencia **Prettier** y **ESLint**.
- `skills/ancleto-upgrade/references/templates.md:89-95` fija la verificación de un change de migración
  como compile de **TypeScript**, tests y lint; y `:170-198` fija `npx tsc --noEmit`, `npm run build`,
  `npm run lint`, `npm test` y `npm run test:ci`. El gating `only when the script exists` (`:198`) cubre
  T-V-002..T-V-005 pero **no** `T-V-001` (`npx tsc --noEmit` queda incondicional).
- `skills/ancleto-pr/SKILL.md:79` fija `Unit tests pass (\`npm test\`)` en el checklist de Test Plan que
  el skill genera.
- **La actualización no reconcilia superficies mergeadas por bloques**: las rutas que mergean los
  templates raíz (`TEMPLATES = ['AGENTS.md', 'PRODUCT.md']`, `src/cli/index.js:24`) sólo re-aplican/insertan
  bloques `LOCKED`. Como `mergeLocked` sólo entiende marcadores `LOCKED`, el texto **plano** viejo de
  validaciones (`templates/AGENTS.md:22-25` de la versión anterior) es inmune al merge: **sobrevive** en
  instalaciones existentes. Tras `upgrade`, `findInsertAnchor` inserta el bloque nuevo
  `LOCKED: validation-commands` pero la lista plana vieja queda al lado → la contradicción que este
  change busca eliminar **persiste** en instalaciones ya existentes. Lo demuestra el `AGENTS.md` raíz de
  este repo (`:22-25`), que todavía conserva la lista. El gap afecta a **toda ruta que invoca `mergeLocked`
  sobre `TEMPLATES`**: `install`/`update`/`upgrade` (vía `copyTemplates`, `:1392`) **e** `import`
  (`importCmd`, `src/cli/index.js:2834`, merge en `:2896`). La premisa "las copias instaladas se regeneran"
  vale para `.opencode/skills/` (copiado entero) pero **no** para `AGENTS.md` (mergeado por bloques).

En proyectos JavaScript —incluido este repo— **no existen `typecheck` ni Prettier**. El `package.json`
expone `lint` y `test` (`package.json:33-36`). Prettier se descartó a propósito (memoria
`linter-standard-config`; el linter estándar es `linter-standard`). Además `PRODUCT.md:115` quedó stale:
afirma que no hay scripts npm cuando sí los hay.

El resultado es que coder/tester reportan "gate ausente" o asumen un formatter inexistente en cada
change, en vez de validar contra lo que el proyecto declara.

## Proposed change

Hacer el contrato de validaciones **declarativo**: una única fuente de verdad (los comandos que el
proyecto declara en `PRODUCT.md` → `## Project Commands`) y prompts que **referencian** esa fuente en
vez de hardcodear comandos o herramientas.

1. **Política en bloque LOCKED de `templates/AGENTS.md`**: correr SOLO lo que el proyecto declare en
   `PRODUCT.md` → `## Project Commands`; si un comando falta, saltear y registrar; **nunca inventar**.
2. **Declarar los comandos reales** en `PRODUCT.md` (sección `## Project Commands`) y corregir
   `PRODUCT.md:115`.
3. **`agents/coder.md` y `agents/tester.md`** dejan de hardcodear Prettier/ESLint y usan el comando real
   declarado por el proyecto.
4. **Format check = `not-configured`** si el proyecto no declara un formatter (no asumir Prettier).
5. **Suite de tests** vía `npm test` **o rutas explícitas**; **NUNCA** `node --test` pelado (matchea el
   vendored; memorias `test-runner-invocation` / `node-test-scope-explicit-paths`).
6. **`skills/ancleto-upgrade/references/templates.md`**: las plantillas de verificación (spec `REQ-V-*`
   y tasks `T-V-*`) dejan de fijar comandos concretos (`npx tsc --noEmit`, `npm run build`, `npm run
   lint`, `npm test`, `npm run test:ci`) y referencian los comandos declarados; el typecheck deja de ser
   incondicional y cada verificación se emite sólo si el comando está declarado.
7. **`skills/ancleto-pr/SKILL.md:79`**: el Test Plan que el skill genera usa el comando de test declarado
   por el proyecto en vez de fijar `npm test`.
8. **Actualizar `test/content-guards.test.js` en el mismo change** (guardrail del repo: los guards fijan
   contratos de prompt) y cubrir también estas superficies.
9. **Reconciliación en `install`/`update`/`upgrade` e `import`** (hallazgo material de review): además
   de envolver el contenido canónico como bloque `LOCKED` en `templates/AGENTS.md`, un **helper único**
   `mergeTemplateInto(source, local, filename)` (punto único: reconcilia bloques legados antes de
   `mergeLocked`) se invoca desde **toda ruta que mergea `TEMPLATES`** —`copyTemplates`
   (`install`/`update`/`upgrade`) e `importCmd` (`import`)— y reconoce y **elimina el bloque plano legado**
   de validaciones en el `AGENTS.md` de instalaciones existentes, **seguro** (no toca contenido del usuario
   fuera del bloque identificado) e **idempotente**. Así ninguna ruta mergea sin reconciliar y
   `ancleto upgrade`/`install`/`import` deja los proyectos existentes en estado pulido y coherente
   **sin pasos manuales**.

## Scope

In scope:

- `templates/AGENTS.md`: nueva política de validaciones en un bloque `LOCKED` (reemplaza la lista fija de
  `:22-25`).
- `PRODUCT.md`: corrección de `:115` y declaración real en `## Project Commands`.
- `agents/coder.md` (`:95`, `:117`) y `agents/tester.md` (`:133`, `:145`, `:151`): quitar el hardcode de
  formatter/linter y referenciar el comando declarado.
- `skills/ancleto-upgrade/references/templates.md` (`:89-95`, `:170-198`): quitar el typecheck
  incondicional y los comandos npm fijos; referenciar los comandos declarados.
- `skills/ancleto-pr/SKILL.md` (`:79`): Test Plan por comando declarado, sin `npm test` fijo.
- `test/content-guards.test.js`: asserts de comportamiento del contrato de validaciones, incluidas estas
  superficies de skill.
- `src/cli/index.js`: **helper único** `mergeTemplateInto(source, local, filename)` (reconcilia bloques
  legados antes de `mergeLocked`) invocado desde **toda ruta que mergea `TEMPLATES`** —`copyTemplates`
  (`install`/`update`/`upgrade`, `:1402`) e `importCmd` (`import`, `:2896`)—, con la tabla declarativa de
  firmas legadas que reconoce y elimina la lista plana vieja de validaciones en el `AGENTS.md` de
  instalaciones existentes. Seguro, idempotente, host-neutral y zero-deps.
- `test/cli.test.js`: casos de reconciliación (upgrade e **import**) de un `AGENTS.md` pre-change (lista
  plana legada → queda limpio, sin duplicar y preservando el resto).
- Menores aprobadas: `PRODUCT.md:20` (conteo de suite stale), `PRODUCT.md:94` (duplicación de la lista
  de validaciones) y `skills/ancleto-upgrade/references/templates.md:175` (literal `npx nx affected`
  → "el target declarado"), con su guard en `test/content-guards.test.js`.

Out of scope:

- **Zero-deps de runtime**: se mantiene; no se agregan dependencias.
- Salvaguardas intocables: Validation Ledger y los cinco flags, bloqueo por CRITICAL, `bash:false` en
  reviewer/orchestrator/spec-writer, verificación de garantías bajo modelo real, verificación de
  afectados, baseline reproducible — **no se tocan**.
- **Refutados**: dar bash al reviewer; auto-aprobar direct trivial; fusionar checkpoints; fusionar
  tester+reviewer; paralelizar coder↔tester; bajar `MAX_TOKENS` sin ΔQ≥0.
- `throughput-pipeline` y `devloop-test-split`: fuera de este change.
- La copia instalada `.opencode/skills/` (dogfooding): se regenera en `install`/`upgrade`; no se edita a
  mano. La fuente canónica es `skills/` (raíz), que es lo que el CLI publica y lo que leen los guards.
  **Aclaración**: `AGENTS.md` **no** entra en esta categoría (se mergea por bloques, no se copia entero),
  de ahí la reconciliación explícita de este change.

## Risks

- **Recortar una salvaguarda protegida**: mitigación — el change no toca ninguna; los guards que las
  cubren (`bash:false`, cinco flags, Validation Ledger, CRITICAL) se conservan y se verifican.
- **Filtrar instrucción host-específica al texto compartido**: mitigación — la política es host-neutral
  (no nombra ningún host) y vive en `templates/AGENTS.md`, respetando el requirement vigente
  "Instrucciones específicas de host fuera del texto compartido" (`prompt-contracts`).
- **Solapamiento de archivos con `token-budget`**: ambos changes tocan `templates/AGENTS.md` y
  `test/content-guards.test.js`. `token-budget` ya está archivado y dejó el estado base; este change es
  su sucesor y se declara la **dependencia de secuencia** (no mergear en paralelo) en `tasks.md`.
- **Divergencia con el seed técnico**: `docs/technical-discovery/setup.md:114-118` documenta el contrato
  viejo; el archive deberá chequear frescura del seed (protocolo `LOCKED: seed-freshness`).
- **Plantillas de skill para proyectos ajenos**: `templates.md` genera guías para proyectos JS/TS de
  terceros que podrían no declarar comandos. Mitigación — la guía referencia la fuente declarada
  (`PRODUCT.md` → `## Project Commands`) y condiciona cada verificación a que el comando exista/esté
  declarado, sin romper la utilidad del ejemplo.
- **Migración que borra contenido del usuario**: la reconciliación elimina texto plano en archivos
  EXTENSIBLES. Mitigación — sólo elimina cuando la firma legada coincide **exactamente** (CRLF/espaciado
  tolerados); ante cualquier diferencia **no toca** y emite un aviso; nunca borra fuera del bloque
  identificado. Además es idempotente, así que re-ejecutar `upgrade` no acumula ni rompe.
- **Multi-host**: la reconciliación corre en el CLI (host-agnóstico) y no introduce texto
  host-específico en assets compartidos.

## Non-goals

- No se cambia la forma en que un proyecto declara sus comandos más allá de usarse `## Project Commands`
  (sección ya existente en `templates/PRODUCT.md:88-93`).
- No se valida la existencia real de los scripts declarados vía CLI/doctor (eso es el ítem B2 del
  `BACKLOG.md`, fuera de este change).
- La reconciliación **no** reemplaza archivos EXTENSIBLES ni introduce un framework de migraciones
  versionadas: es una tabla declarativa de **firmas legadas** (hoy una entrada) aplicada de forma
  idempotente en el punto único `mergeTemplateInto`, invocado por toda ruta que mergea `TEMPLATES`
  (`copyTemplates` e `importCmd`). `PRODUCT.md` no tiene entrada (no aloja lista plana gestionada por el
  framework); el mecanismo queda listo para registrar firmas futuras si aparecen.
