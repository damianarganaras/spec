# AI Agents Context

> Contexto global para agentes de IA en este repositorio.

## Context Hierarchy

Antes de actuar, consultar el contexto en este orden:

1. El `AGENTS.md` local del package o app afectada, si existe.
2. `PRODUCT.md` para contexto del repositorio, estructura, comandos y reglas de producto.
3. `CONTRIBUTING.md` para el flujo de contribución y validaciones esperadas.
4. Este `AGENTS.md` como marco común.

En caso de conflicto, gana la documentación más específica del área afectada.

## Guardrails

- Cambios de TypeScript en modo estricto donde aplique.
- Mantener el repositorio en estado mergeable.
- No commits directos a ramas protegidas (`main`, `develop`).
- Commits con Conventional Commits.
- Toda operación destructiva requiere confirmación explícita del usuario.
- Antes de cerrar un cambio, correr las validaciones que el proyecto considere necesarias.

## Flujo de trabajo

Este repositorio usa el flujo spec-driven (OpenSpec) cuando corresponde:

- Cambios nuevos o con scope incierto: artifacts en `openspec/changes/<name>/`
- Cambios chicos y de riesgo bajo: implementación directa
- Archivar con `openspec archive` cuando el cambio este completo

## Herramientas

- `ancleto` CLI para inicialización de proyectos y descubrimiento técnico.
- `openspec` CLI para el ciclo de changes (proposal, specs, design, tasks, archive).