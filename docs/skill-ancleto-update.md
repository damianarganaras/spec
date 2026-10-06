# Skill ancleto-update

## Introducción

`ancleto-update` es la skill que actualiza los artifacts de un change existente cuando **cambió una
definición**: un requirement del spec principal, el alcance o una decisión de diseño. A diferencia de
`ancleto-propose`, que crea los artifacts, `ancleto-update` los **revisa con merge no destructivo**,
preservando todo lo que el cambio no menciona.

**Diferencia clave**: no reescribe el change. Aplica la edición mínima al artifact dueño del cambio y
preserva el resto.

## ¿Cómo se distingue de las otras skills?

| Skill | Qué hace | Dirección |
|---|---|---|
| `ancleto-propose` | Crea los artifacts de un change nuevo (overwrite) | — |
| `ancleto-continue` | Crea el siguiente artifact faltante | — |
| `ancleto-sync-specs` | Propaga deltas hacia los specs principales | change → main |
| `ancleto-update` | Actualiza los artifacts del change ante un cambio de definición | main → change |
| `ancleto-verify` | Verifica completitud contra los artifacts | — |

> **Ojo**: `ancleto-update` (skill, `/cleto-update`) actualiza artifacts. El CLI `ancleto update`
> reinstala el paquete. No son lo mismo.

## ¿Qué cambia y en qué artifact?

Cada cambio tiene un único artifact dueño:

| Qué cambió | Artifact dueño |
|---|---|
| Requisito / comportamiento | `specs/<capability>/spec.md` (`## MODIFIED Requirements`) |
| Decisión de diseño | `design.md` |
| Alcance | `proposal.md` |
| Trabajo nuevo | `tasks.md` |

## El flujo

1. **Seleccionar el change** — nunca auto-selecciona; si el nombre cae en `archive/`, se detiene.
2. **Leer los artifacts** presentes (proposal, specs, design, tasks).
3. **Consolidar el cambio** desde dos fuentes aditivas: el **drift** entre los delta specs y los specs
   principales, y la definición que describe el usuario.
4. **Clasificar por dueño y mergear** con preservación del contenido no mencionado.
5. **Preguntar el modo** (no lo elige solo): **in-place** (edita y registra en `## Change Log`) o
   **rev2** (escribe solo los artifacts afectados bajo `rev2/`, dejando los originales intactos).
6. **Reportar** y ofrecer `ancleto-verify` si cambió comportamiento especificado.

## Ejemplos de Invocación

```text
/cleto-update add-auth "el requirement de expiración de token ahora es 15m"
/cleto-update add-auth                     → detecta drift contra aspec/specs/<capability>/
/cleto-update                                → lista los changes activos y pregunta
```

## Guardrails

- **Merge, no overwrite**: preserva lo no mencionado; idempotente.
- **Alcance acotado**: no toca `aspec/changes/archive/`, ni los specs principales (eso es
  `ancleto-sync-specs`), ni código de implementación (eso es `ancleto-apply`).
- **Preguntar, no adivinar**: si el change, el artifact dueño o el modo no están claros, se pregunta.
