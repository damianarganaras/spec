# Contributing

Guía de contribución para este repositorio personal.

## Flujo

1. Crear rama de features: `feat/`, `fix/`, `chore/`
2. Commits en formato Conventional Commits:
   - `feat(scope): descripcion en presente`
   - `fix(scope): descripcion en presente`
   - `chore(scope): descripcion en presente`
   - `docs(scope): ...`
   - `refactor(scope): ...`
   - `test(scope): ...`
4. Abrir PR/merge request contra `main` con título semántico y plan de pruebas cuando aplique.
5. No forzar push ni saltar hooks de validación.

## Validaciones

Correr antes de cerrar un cambio (según el proyecto):

- `npm run typecheck` / `tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`