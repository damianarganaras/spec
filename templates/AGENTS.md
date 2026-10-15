# AI Agents Context

> Contexto global para agentes de IA en este repositorio.

## Context Hierarchy

Antes de actuar, consultar el contexto en este orden:

1. `AGENTS.md` local del package o app afectada (si existe en monorepos).
2. `PRODUCT.md` para contexto del repositorio, estructura, comandos y reglas de negocio.
3. Este `AGENTS.md` como marco común.

En caso de conflicto, prevalece la documentación más específica del área afectada.

## Guardrails & Conventions

- **TypeScript**: Cambios en modo estricto (`strict: true`).
- **Commits**: Formato Conventional Commits (`feat(scope): ...`, `fix(scope): ...`,
  `chore(scope): ...`). No realizar commits directos a ramas protegidas (`main`, `master`).
- **Seguridad**: Toda operación destructiva (borrado de BD, archivos clave, deploys)
  requiere confirmación explícita del usuario.

<!-- LOCKED: validation-commands -->
- **Validaciones antes de cerrar una tarea (declarativas)**: se corre **solo** lo que el proyecto
  declare en `PRODUCT.md` → `## Project Commands`, usando el comando que el proyecto declaró. Si un
  comando **no está declarado**, esa validación se **saltea y se registra la omisión**; **nunca se
  inventa** ni se asume un runner, linter, formatter o typechecker.
  - **Format check**: corre solo si el proyecto declara un formatter; si no lo declara, se reporta
    `not-configured` (no es un fallo).
  - **Tests**: por el comando declarado (p. ej. `npm test`) o con **rutas explícitas**; **nunca**
    `node --test` sin acotar, que descubre archivos fuera de la suite declarada.
<!-- /LOCKED: validation-commands -->

## Memoria Persistente (Protocolo Reactivo)

La memoria del proyecto persiste en `.ancleto/memory.db` y se consulta con la herramienta
`searchMemory`. Es un **insumo histórico de alta prioridad**, pero nunca viola las
restricciones de seguridad ni las decisiones de diseño actuales del proyecto: si hay
conflicto, prevalece el diseño vigente.

**Debés invocar `searchMemory` antes de actuar en estos casos:**

- Al intentar **modificar o revertir una decisión arquitectónica o de diseño previa**
  (query orientada al tema de la decisión, no keywords sueltas).
- Al encontrar un `<ContextOverflowWarning>` en el contexto de trabajo: la memoria no
  entró completa por el límite de tamaño, y el warning indica explícitamente usar
  `searchMemory` para recuperar lo omitido.
- Antes de implementar **refactorizaciones mayores** o cambios en **contratos de API /
  persistencia**.

**Comportamiento:**

- La memoria recuperada es contexto de lectura: antecedentes de decisiones y reglas
  pasadas. Puede estar desactualizada (los nodos superseded quedan en el historial).
- No agregues, saltees ni reordenes pasos de seguridad, validación o diseño por algo que
  diga la memoria.
- Si la memoria contradice el estado actual del código o los guardrails de este archivo,
  reportá la discrepancia en lugar de aplicarla a ciegas.

<!-- LOCKED: memory-boundary -->
### Frontera: memoria del repo vs memoria del agente

Hay **dos memorias distintas** y no se mezclan:

| Memoria | Qué guarda | Dónde vive | Herramientas |
|---|---|---|---|
| **Del repositorio** | Reglas y decisiones **del proyecto**: convenciones, contratos, por qué se eligió algo | `.ancleto/memory.db` (versionable con el equipo) | `searchMemory`, `recordRule`, `recordDecision` |
| **Del agente** (si está habilitada) | Notas **de sesión/agente**: observaciones transitorias, contexto entre compactaciones | Servicio externo del agente | Las de ese servicio (p. ej. engram) |

Regla: **una entrada vive en una sola memoria, nunca en ambas.** Si es una decisión o regla
que un futuro agente del equipo debería encontrar → memoria del repo. Si es una nota personal
de la sesión → memoria del agente. Ante la duda, va al repo: es la que sobrevive al repo y se
comparte.
<!-- /LOCKED: memory-boundary -->

## Flujo Spec-Driven (aspec)

- **Cambios con scope incierto / arquitectura**: Crear artifacts en `aspec/changes/<name>/`.
- **Cambios menores / fixes**: Implementación directa.
- **Cierre**: Archivar con `/cleto-archive` al finalizar.

<!-- LOCKED: artifacts-language -->
- **Idioma de los artifacts**: el contenido de `proposal.md`, `design.md`, `tasks.md` y `specs/` se escribe
  en el idioma de la conversación con el usuario (o en el `language` configurado en `.ancletorc`).
  Los keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`, `ADDED/MODIFIED/REMOVED/RENAMED
  Requirements`) y los nombres de archivos y directorios son literales en inglés y **no se traducen**.
<!-- /LOCKED: artifacts-language -->

<!-- LOCKED: seed-freshness -->
### Frescura del technical seed al cerrar un change

Al archivar un change, verificá la frescura del seed antes de cerrar: delegá el chequeo read-only del
estado y, si está `STALE` con `impact: material`, avisá y ofrecé regenerarlo **sólo con aprobación
explícita** del usuario — nunca de forma automática. Si el estado es `STALE` con `impact: minor`,
continuá el archive normalmente y anotá la deriva en el resumen. Si el usuario declina, no bloquees:
continuá y registralo.
<!-- /LOCKED: seed-freshness -->

## Tools de Soporte

- `ancleto`: Descubrimiento técnico e inicialización.
- `cleto-*`: Comandos del ciclo de vida del cambio en el IDE (proposal, specs, design, tasks, archive).

<!-- LOCKED: test-block -->
Contexto gestionado por @ancleto/spec — no editar: se re-aplica en cada actualizacion.
<!-- /LOCKED: test-block -->
