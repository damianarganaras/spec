# ancleto

Orquestador SDD liviano con subagentes optimizados para costo/tokens. Toolkit personal
de desarrollo asistido por IA para opencode: ciclo spec-driven completo (OpenSpec),
agents y skills, más un CLI de inicialización y descubrimiento técnico del repositorio.

Binarios: `ancleto` (alias: `aspec`).

## Qué incluye

- **Agents (10)**: orchestrator, coder, tester, spec-writer, reviewer, documenter,
  technical-discovery, technical-seed-writer, memory-keeper, context-resolver.
- **Commands (12)**: `opsx-*` — ciclo de vida de changes OpenSpec (new, propose, ff,
  apply, verify, sync, archive, bulk-archive, continue, explore, onboard, recall).
- **Skills (4)**: `ancleto-commit`, `ancleto-pr`, `ancleto-technical-discovery`, `ancleto-upgrade`.
- **Templates**: `AGENTS.md`, `PRODUCT.md`, `CONTRIBUTING.md` para proyectos nuevos.
- **CLI `ancleto`**: instalación (`ancleto install`), init de proyectos (`ancleto init`) y
  descubrimiento técnico (`ancleto discovery`, motor pendiente).

## Instalación

```bash
ancleto install                          # global: disponible en todos tus proyectos
ancleto install --project /ruta/repo     # por proyecto: .opencode/ + templates en la raiz
ancleto update                           # re-instala la ultima version
```

## Requisitos

- Node.js >= 18
- `openspec` CLI (`npm i -g @openspec/cli`) para el ciclo de changes
- Repomix (requerido solo por el futuro motor de `ancleto discovery`)

## Uso rápido

```bash
ancleto init                             # prepara .ancletorc en el repo actual
# en opencode: /opsx-new, /opsx-propose, /opsx-ff para iniciar un change
```

## Estado

- [x] Paquete y CLI de instalación
- [x] Agents/skills/commands adaptados (sin referencias corporativas)
- [ ] Motor de descubrimiento (`ancleto discovery`, repomix)
- [ ] Skills faltantes: `triage-clarifier`, `openspec-recall`, `openspec-sync-specs`