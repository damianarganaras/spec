# Design: Import de proyecto OpenSpec pre-existente en init (brecha externa)

## Approach

No se reescribe la migración existente: se reutiliza su helper, su marcador
`aspec/.migrated-from-openspec` y su política de no-pisado, y se agregan tres ramas
nuevas. (1) **Detección externa**: antes del scaffold, `initProject`/`scaffoldAspec`
distinguen layout OpenSpec estándar externo (`openspec/specs/` o `openspec/changes/`
con archivos, o `AGENTS.md` con firma OpenSpec) del legacy ya cubierto; ante un
externo, prompt interactivo "Detecté un proyecto OpenSpec. ¿Importar a aspec/?"
(Sí/No/ver detalle, default No) y, si acepta, importación semilla (specs archivadas +
changes activos + tratamiento del `AGENTS.md`). (2) **install --project**: pasa por el
mismo helper de detección antes de `scaffoldAspec`. (3) **upgrade sin `.ancletorc`**:
en lugar de exigir `init` primero, ofrece migración directa cuando detecta
`openspec/`. Todo es no destructivo: `openspec/` siempre se conserva como backup.

Decisiones de diseño:
- Un solo helper `detectLegacyOpenSpec(projectDir)` (+ extensión de importación) usado por `init`, `install --project` y `upgrade`: cero divergencia.
- El `AGENTS.md` de OpenSpec nunca se pisa en silencio: se convierte/respeta con aviso y merge del mismo estilo que los bloques `LOCKED` cuando aplica.
- Falso positivo controlado: carpeta `openspec/` vacía o sin `changes/`/`specs/` con contenido → no-op silencioso, sin prompt.
- Idempotencia heredada del marcador existente: segunda corrida no recopía ni advierte.

## Architecture

```text
initProject / install --project / upgradeCmd
└── detectLegacyOpenSpec(projectDir)
    ├── sin openspec/ con contenido → no-op (scaffold normal)
    ├── legacy propio (caso ya cubierto) → rama existente (copia + marcador)
    └── openspec externo (specs/changes con archivos o AGENTS.md OpenSpec)
        ├── prompt interactivo (default No) / --yes|non-interactive → No
        ├── Sí → importar: specs + changes + AGENTS.md (con aviso, sin pisar aspec/ real)
        │         + marcador .migrated-from-openspec
        └── aspec/ con contenido real sin marcador → avisar y no tocar
```

## Validation

- Tests con fixture de proyecto OpenSpec externo: `init` importa `aspec/specs` + `aspec/changes`, conserva `openspec/` intacto y escribe el marcador.
- `aspec/` pre-existente con contenido → no pisa (test de guarda).
- `install --project` sobre fixture externo ejecuta la detección (test que hoy falla).
- `upgrade` sin `.ancletorc` sobre fixture externo migra en lugar de exigir `init`.
- Suite completa `node --test` en verde, sin regresión en los tests del change archivado.
