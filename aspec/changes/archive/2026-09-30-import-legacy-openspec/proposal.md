# Proposal: Import de proyecto OpenSpec pre-existente en init (brecha externa)

## Problem

El change archivado `migrate-openspec-to-aspec` ya resolvió la migración del legacy
propio de ancleto (copia no destructiva `openspec/` → `aspec/` con marcador
`aspec/.migrated-from-openspec` en `init`/`upgrade`, con tests en `test/cli.test.js`).
Quedan tres brechas abiertas: (1) un proyecto que nunca usó ancleto y trae un OpenSpec
estándar externo (`openspec/specs` archivadas, `openspec/changes` activos, `AGENTS.md`
de OpenSpec) no recibe tratamiento de importación semilla —solo copia cruda—; (2)
`install --project` llama a `scaffoldAspec` (`src/cli/index.js:930-933`) sin pasar por
la detección/migración; (3) `upgrade` exige `.ancletorc` ("Ejecuta 'ancleto init'
primero") y no puede migrar un proyecto openspec virgen.

## Proposed change

Extender el helper de migración existente para cubrir el gap externo: detección de
layout OpenSpec estándar con aviso interactivo ("Detecté un proyecto OpenSpec.
¿Importar a aspec/?", default No), conversión/respeto del `AGENTS.md` de OpenSpec,
extensión de la detección a `install --project`, y permitir `upgrade` migratorio sin
`.ancletorc`. Reutilizar el marcador de idempotencia y la política de no-pisado del
change archivado; no duplicar su lógica.

## Scope

In scope:
- Detección de OpenSpec externo (`openspec/changes/` o `openspec/specs/` con contenido) + prompt interactivo con default No.
- Tratamiento del `AGENTS.md` de OpenSpec (convertir/respetar, nunca pisar el local sin aviso).
- Cablear detección en `install --project` vía el mismo helper.
- `upgrade` migratorio sin `.ancletorc` (o instrucción `init` → import).
- Tests con fixture de proyecto OpenSpec externo.

Out of scope:
- Reescribir la migración ya implementada y testeada del change archivado.
- Borrar `openspec/` (siempre queda como backup salvo flag explícito futuro).
- Fusión fina de specs incompatibles (se copian tal cual; el motor SDD comparte origen).

## Risks

- Duplicar la lógica del change archivado y diverger: mitigación reutilizando su helper y marcador, agregando solo la rama externa.
- Pisar `aspec/` con contenido real al importar: mitigación con la guarda existente (avisar y no tocar si `aspec/` tiene contenido sin marcador).
- Falso positivo de detección (carpeta `openspec/` vacía o residual): mitigación exigiendo contenido (`changes/` o `specs/` con archivos) antes de ofrecer la importación.
