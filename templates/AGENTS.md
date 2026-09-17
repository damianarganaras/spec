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
- **Validaciones obligatorias antes de cerrar una tarea**:
  - `npm run typecheck` o `npx tsc --noEmit`
  - `npm run lint`
  - `npm test`

## Flujo Spec-Driven (OpenSpec)

- **Cambios con scope incierto / arquitectura**: Crear artifacts en `openspec/changes/<name>/`.
- **Cambios menores / fixes**: Implementación directa.
- **Cierre**: Archivar con `openspec archive` al finalizar.

## Tools de Soporte

- `ancleto`: Descubrimiento técnico e inicialización.
- `openspec`: Gestión del ciclo de vida del cambio (proposal, specs, design, tasks, archive).
