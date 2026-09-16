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
ancleto install --no-mcp                 # igual, sin tocar la config MCP de opencode
ancleto update                           # re-instala la ultima version
```

El instalador configura por defecto los MCP locales **engram** (memoria persistente) y
**caveman** (compresion de contexto) en `~/.config/opencode/opencode.json`, fusionandose
con la config existente (no pisa nada). Si un binario no se encuentra en el sistema, ese
MCP se omite con un warning.

## Tiers de costo

En la primera configuración (`ancleto install`) se pregunta el nivel de gasto de los
agents; también se elige con `--tier`:

```bash
ancleto install --tier normal     # modelos opencode-go balanceados (default)
ancleto install --tier minimo     # todo al modelo pagado mas economico viable
ancleto install --tier gratis     # solo modelos gratuitos (ej. opencode/big-pickle)
```

El nivel elegido queda guardado (`.ancleto-tier`) y `ancleto update` lo re-aplica sin
volver a preguntar. Al llegar al tope mensual de la suscripcion, opencode cae
automaticamente a los modelos gratuitos.

## Requisitos

- Node.js >= 18
- `openspec` CLI (`npm i -g @openspec/cli`) para el ciclo de changes
- Repomix (requerido solo por el futuro motor de `ancleto discovery`)

## Uso rápido

```bash
ancleto init                             # prepara .ancletorc en el repo actual
ancleto init --with-azure                # lo mismo, con Azure habilitado
# en opencode: /opsx-new, /opsx-propose, /opsx-ff para iniciar un change
```

## Azure DevOps (opcional)

Azure viene **desactivado por defecto**. Para activarlo en un proyecto:

```bash
ancleto init --with-azure    # escribe .ancletorc con azure.enabled: true
```

Luego completar la seccion `Azure DevOps` de `PRODUCT.md` (Organization URL, Team Project)
e instalar el CLI: `az extension add --name azure-devops`. Con `azure.enabled: false` (o sin
`.ancletorc`), los flujos tratan cada request como sin Work Item y `ancleto-pr` usa GitHub.

## Estado

- [x] Paquete y CLI de instalación
- [x] Agents/skills/commands adaptados (sin referencias corporativas)
- [ ] Motor de descubrimiento (`ancleto discovery`, repomix)
- [ ] Skills faltantes: `triage-clarifier`, `openspec-recall`, `openspec-sync-specs`