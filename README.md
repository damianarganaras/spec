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
- **Skills (7)**: `ancleto-commit`, `ancleto-pr`, `ancleto-technical-discovery`, `ancleto-upgrade`,
  `triage-clarifier`, `openspec-recall`, `openspec-sync-specs`.
- **Templates**: `AGENTS.md`, `PRODUCT.md` para proyectos nuevos.
- **CLI `ancleto`**: instalación (`ancleto install`), init de proyectos (`ancleto init`) y
  descubrimiento técnico (`ancleto discovery`, pack con Repomix).
- **Motor de memoria (v0.2.0)**: base local `.ancleto/memory.db` sobre `node:sqlite`
  (zero-deps, Node >= 24). Tres tools para el LLM — `searchMemory` (BM25, FTS5),
  `recordRule` y `recordDecision` — con supersesión atómica por `memory_key`; reglas
  inyectadas proactivamente en `<ProjectMemoryRules>` y decisiones recuperadas
  reactivamente.
- **Documentación**: `docs/` — `ancleto-cli-framework.md` (guía del framework),
  `guia-configuracion.md` (puesta a punto del entorno) y `skill-ancleto-upgrade.md`.

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

- Node.js >= 24.0.0 (el motor de memoria v0.2.0 usa `node:sqlite`)
- `openspec` CLI (`npm i -g @openspec/cli`) para el ciclo de changes
- Repomix (usado por `ancleto discovery`, se resuelve via `npx` si no esta instalado)

## Uso rápido

```bash
ancleto init                             # prepara .ancletorc en el repo actual
ancleto init --with-azure                # lo mismo, con Azure habilitado
ancleto discovery --check                # estado del technical seed (READY/STALE/PARTIAL/MISSING)
ancleto discovery                        # empaca el repo con Repomix y guarda estado
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

## Flujo de release

Publicación automática vía GitHub Actions (`publish.yml`):

```bash
# 1. Bump local (regla: todo commit de feature lleva su version bump)
npm version patch --no-git-tag-version        # o: minor, segun el cambio
git add package.json package-lock.json
git commit -m "chore: bump version to X.Y.Z"
git push origin development

# 2. Merge development -> main
git checkout main
git pull origin main
git merge development

# 3. Tag anotado y push
git tag -a vX.Y.Z -m "vX.Y.Z - <resumen>"
git push origin main
git push origin vX.Y.Z

# 4. GitHub Release
# En GitHub: Releases -> Draft a new release -> elegir el tag vX.Y.Z -> Publish release
```

Al publicar la Release, el workflow `publish.yml` se dispara (`on.release.types: [published]`):
corre `node --test` en `ubuntu-latest` (Node 24, checkout@v5/setup-node@v5) y publica a npm con
`NODE_AUTH_TOKEN` (secret `NPM_TOKEN` del repo).

## Estado

- [x] Paquete y CLI de instalación
- [x] Agents/skills/commands adaptados (sin referencias corporativas)
- [x] Motor de descubrimiento (`ancleto discovery`, Repomix + `--check` por hash)
- [x] Skills base: `triage-clarifier`, `openspec-recall`, `openspec-sync-specs`
- [x] Motor de memoria core (v0.2.0): `.ancleto/memory.db`, 3 tools, supersesión atómica