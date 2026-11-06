# Proposal: Endurecimiento de `ancleto specs merge` (0.22.1)

## Problema

CH-06a quedó cerrado en 0.22.0 con `ancleto specs merge --change <slug> [--dry-run] [--json]`, pero
`aspec/backlog.md` declara deuda residual verificable: (a) `--change archive` coincide con el
directorio contenedor y sale 0 en vez de fail-closed; (b) el spec canónico restringe el preámbulo H1 a
los literales `# Delta:` / `# Spec delta:`, mientras el parser acepta cualquier `# ` y permite más de
un H1; (c) la inserción `ADDED` deja dos líneas en blanco antes de la siguiente sección; (d) falta el
test de `## RENAMED Requirements` vacío; y (e) la fase de escritura es secuencial y no transaccional,
sin que la spec lo declare como exclusión. La aceptación es offline y no requiere superficie nueva.

## Alcance

**Dentro:**

- **Contenedor `archive` fail-closed.** `--change archive`, o cualquier slug cuyo directorio activo
  resuelto sea `aspec/changes/archive`, sale con exit code 2 y cero escrituras, y el mensaje nombra el
  slug o el contenedor. La detección es por identidad de path del contenedor, NO por presencia de
  `proposal.md`: hay change dirs delta-only válidos y archives legacy sin `proposal.md`. `--dry-run`
  también sale 2.
- **Preámbulo H1 estructural.** Se acepta A LO SUMO un H1 a columna 0 al inicio, seguido de líneas en
  blanco opcionales y de la primera sección `## ` reconocida. Un segundo H1, o cualquier línea no
  vacía y no H1 antes de la primera sección, es fail-closed (exit 2, cero escrituras). NO se restringe
  a una lista literal de títulos: 78 deltas archivados usan al menos cuatro formas legacy de H1
  (`# Spec: X (delta)`, `# Delta Spec: X`, `# Spec delta: X — cap`, `# Delta: X — desc`), y una
  allowlist literal rompería la re-merge de archives.
- **Espaciado `ADDED`.** Exactamente una línea en blanco entre el bloque insertado y la siguiente
  sección `## ` (o el EOF), de forma determinística; hoy `applyAdd` rebobina sobre blancos y los
  vuelve a incluir, produciendo dos.
- **`## RENAMED Requirements` vacío.** No-op válido, exit 0, `changed:false`, sin cambio de `mtime`;
  se agrega el test faltante.
- **Delta canónico** en `aspec/specs/spec-sync/spec.md` con dos `MODIFIED Requirements` de título
  exacto: "Merge determinístico de delta specs sobre specs canónicos existentes" y "Fail-closed ante
  ambigüedad o delta inválido". Se preservan los escenarios no mencionados y se agregan los de
  espaciado, `RENAMED` vacío y contenedor `archive`.

**Fuera (exclusión explícita):**

- **Atomicidad de la fase de escritura.** NO se implementan escrituras transaccionales. La validación
  del plan es fail-closed con cero escrituras; la fase de escritura es secuencial y no transaccional,
  así que un error de I/O o una interrupción durante esa fase puede dejar escritas un prefijo de los
  specs del plan, sin rollback ni atomicidad entre archivos. La spec enuncia esta exclusión acotada;
  no se promete ninguna garantía nueva.
- Cambiar el contrato del comando: sigue siendo `ancleto specs merge --change <slug> [--dry-run]
  [--json]`.
- Tocar el matching por título exacto, la regla de capabilities existentes, el exit 2 por 0/≥2
  matches o delta inválido, `specs check`, `mergeLocked`, el affected-set o los contratos de
  memoria/seed.
- Cambiar `package.json` o la versión del paquete.
- Cualquier candidate rechazado (B/D/E/F/G/H) queda fuera de esta release y no genera delta.

## Riesgos y mitigación

- **Allowlist H1 demasiado estrecha.** Rompería archives legacy al re-mergear. Mitigación: regla
  estructural (un H1 al inicio) y tests con las cuatro formas legacy.
- **Detección del contenedor por `proposal.md`.** Confundiría change dirs delta-only o archives sin
  `proposal.md`. Mitigación: comparar identidad de path contra `aspec/changes/archive`.
- **Test de espaciado frágil.** Un assert por `includes` no fija la estructura. Mitigación: el test
  compara la secuencia exacta de líneas alrededor del bloque insertado.
- **Guard de exclusión convertido en garantía.** Declarar "escrituras atómicas" sin implementarlo
  sería falso. Mitigación: la spec dice explícitamente que sólo el plan es atómico.

## Delta spec

- `specs/spec-sync/spec.md` — 2 `MODIFIED`: "Merge determinístico de delta specs sobre specs canónicos
  existentes" y "Fail-closed ante ambigüedad o delta inválido". Ningún `ADDED`, `REMOVED` ni `RENAMED`
  canónico.

## Decisiones

- **memory_key:** specs-merge-h1-structural-preamble
  **Elección:** aceptar a lo sumo un H1 a columna 0 al inicio del delta —cualquier título, no una
  lista literal— seguido de blancos opcionales y de la primera sección `## ` reconocida; un segundo
  H1 o una línea no vacía y no H1 antes de esa sección es fail-closed.
  **Descartado:** restringir el preámbulo a los literales `# Delta:` / `# Spec delta:`.
  **Justificación:** 78 deltas archivados usan al menos cuatro formas legacy de H1; una allowlist
  literal haría fallar la re-merge de archives ya escritos. El parser actual (`/^#\s/`) es más amplio
  que la spec porque no limita la cantidad de H1, y la regla estructural cierra esa brecha sin romper
  los archives existentes.
  **Refs:**
  - spec:spec-sync#Merge determinístico de delta specs sobre specs canónicos existentes
  - path:src/core/specs-merge.js
  - path:aspec/specs/spec-sync/spec.md
  - change:specs-merge-hardening

  **Estado:** aprobado

- **memory_key:** specs-merge-archive-container-fail-closed
  **Elección:** `--change archive`, o cualquier slug cuyo directorio activo resuelto sea
  `aspec/changes/archive`, sale 2 con cero escrituras y un mensaje que nombra el slug o el contenedor;
  la detección es por identidad de path del contenedor, no por presencia de `proposal.md`.
  **Descartado:** detectar el contenedor por la existencia de `proposal.md` o por el nombre del slug.
  **Justificación:** hay change dirs delta-only válidos y archives legacy sin `proposal.md`, así que
  esos predicados confunden casos legítimos. La identidad de path es la única señal que distingue el
  contenedor de un change real.
  **Refs:**
  - spec:spec-sync#Fail-closed ante ambigüedad o delta inválido
  - path:src/cli/index.js
  - path:test/specs-merge.test.js
  - change:specs-merge-hardening

  **Estado:** aprobado

- **memory_key:** specs-merge-added-single-blank-line
  **Elección:** la inserción `ADDED` deja exactamente una línea en blanco entre el bloque insertado y
  la siguiente sección `## ` o el EOF.
  **Descartado:** conservar el espaciado actual de dos líneas en blanco por ser determinístico.
  **Justificación:** el resultado actual es determinístico pero no el mínimo correcto; fijar una sola
  línea evita deriva visual y hace que la estructura sea verificable por un test de líneas exactas.
  **Refs:**
  - spec:spec-sync#Merge determinístico de delta specs sobre specs canónicos existentes
  - path:src/core/specs-merge.js
  - path:test/specs-merge.test.js
  - change:specs-merge-hardening

  **Estado:** aprobado

- **memory_key:** specs-merge-write-phase-atomicity-exclusion
  **Elección:** la garantía de atomicidad se limita al plan (fail-closed, cero escrituras); la fase de
  escritura es secuencial y no transaccional, y se documenta como exclusión explícita.
  **Descartado:** implementar escrituras transaccionales con rollback entre archivos en esta release.
  **Justificación:** la deuda de CH-06a sólo requiere que la spec no prometa más de lo verificable; un
  rollback multi-archivo agrega superficie y no tiene caso de prueba offline que lo justifique en un
  patch de 0.22.1. Declarar la exclusión evita una garantía universal falsa.
  **Refs:**
  - spec:spec-sync#Fail-closed ante ambigüedad o delta inválido
  - path:src/core/specs-merge.js
  - path:aspec/backlog.md
  - change:specs-merge-hardening

  **Estado:** aprobado

- **memory_key:** specs-merge-literal-h1-whitelist
  **Elección:** no adoptar una allowlist literal de títulos H1.
  **Descartado:** aceptar sólo `# Delta:` y `# Spec delta:`.
  **Justificación:** rompe la re-merge de los archives legacy que usan otras formas de H1; la regla
  estructural cubre el mismo objetivo sin esa regresión.
  **Refs:**
  - path:src/core/specs-merge.js
  - path:aspec/backlog.md
  - change:specs-merge-hardening

  **Estado:** descartado
