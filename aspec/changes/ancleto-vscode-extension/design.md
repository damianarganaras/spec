# Design: Extensión de VS Code para ancleto

## Approach

Mantener un único núcleo (`src/`, `agents/`, `commands/`, `skills/`, `templates/`) donde npm es la fuente de verdad, y dos envoltorios de distribución: (1) paquete npm actual `@ancleto/spec`, (2) extensión VS Code generada por un build que transforma ese mismo código npm al formato `.vsix`. Cada cambio nuevo en npm se propaga al `.vsix` ejecutando el build, sin edición manual duplicada ni fork. La extensión no reimplementa lógica: invoca el núcleo existente vía host Node de VS Code o terminal integrado, exponiendo los comandos como Command Palette + vista de actividad. El deploy a Marketplace se dispara desde GitHub Actions, en el mismo tag `v*` que publica a npm.

Fase actual solo planning: se elige la opción A (thin-wrapper) frente a B (fork TypeScript completo) y C (solo snippets/prompts sin CLI). Se pospone la implementación al siguiente change (`ancleto-vscode-extension-impl`).

Decisiones de diseño:
- Versionado único: la versión del `.vsix` sigue a `package.json` (`0.6.x`) para evitar divergencia npm vs Marketplace.
- Zero-dependencies se preserva: la extensión solo permite `devDependencies` de build (`@types/vscode`, `vsce`/`@vscode/vsce`, `esbuild` si hace falta) y ninguna dependencia de runtime nueva.
- Activación bajo demanda (`onStartupFinished` o `onCommand:ancleto.*`), con chequeo de `process.version` (Node ≥ 24 por `node:sqlite`) y mensaje de degradación si el host no cumple.
- Instalación de assets reutilizando `ancleto install/update` existente contra el workspace abierto, sin duplicar lógica de merge de bloques `LOCKED`.

## Architecture

```text
@ancleto/spec (repo único, npm = fuente de verdad)
├── src/cli/index.js        # núcleo CLI (sin cambios en esta fase)
├── src/core/...            # discovery, memoria, tiers
├── agents/ commands/ skills/ templates/  # assets instalables
├── scripts/build-vsix.js   # NUEVO (futuro): transforma código npm → layout vsix
└── vscode-extension/       # NUEVO (futuro, generado, no editado a mano)
    ├── package.json        # contributes: commands, views, activationEvents (versión sincronizada)
    ├── src/extension.ts    # activate(): registra comandos, chequea Node, invoca núcleo
    ├── resources/icon.png  # icono Marketplace
    └── README.md           # página Marketplace (reuse de README raíz)
```

Transformación npm → vsix (deploy rápido):
- Un solo script (`scripts/build-vsix.js` o paso `npm run build:vsix`) copia/sincroniza `src/`, `agents/`, `commands/`, `skills/`, `templates/` y la versión de `package.json` raíz al layout `vscode-extension/`, genera el `package.json` de la extensión y luego corre `vsce package`.
- Nada se edita a mano dentro de `vscode-extension/` salvo el shim (`extension.ts`, `contributes`, icono): todo lo demás es derivado y regenerable.
- Ante cada cambio en npm, basta con correr el build para tener un `.vsix` actualizado; el CI lo hace automáticamente en cada tag.

Deploy desde GitHub al Marketplace:
- Workflow `.github/workflows/publish-vsix.yml` (futuro) disparado en tags `v*`, en paralelo al `publish.yml` npm existente: `npm ci` → `node --test` → `npm run build:vsix` → publish a VS Marketplace (`VSCE_PAT`) y Open VSX (`OVSX_PAT`).
- Secrets como variables nombradas (`VSCE_PAT`, `OVSX_PAT`), nunca con valores en el repo.

Mapeo funcional (paridad CLI ↔ extensión):
- `ancleto install` → comando `Ancleto: Install` (paleta + botón vista).
- `ancleto update / upgrade` → `Ancleto: Update`.
- `ancleto discovery / memory / mcp / doctor` → comandos equivalentes que abren terminal integrado o Output Channel.
- `/cleto-*` (12 comandos) → snippets/contributes que insertan o ejecutan el flujo existente, sin redefinirlos.
- Memoria `.ancleto/memory.db` sin cambios de contrato; la extensión opera sobre el workspace folder.

Empaquetado:
- `vsce package` incluye `agents, commands, skills, templates, src` (mismo set que `files` de npm) más el shim de extensión, siempre vía el script de transformación para evitar copias manuales.
- Pipeline futuro en GitHub: job `publish-vsix` que en tags `v*` construye el `.vsix` desde el código npm y publica a VS Marketplace y Open VSX en paralelo al publish npm existente.

## Decisiones confirmadas (Fase 1, 2026-09-30)

- Nombre Marketplace: `ancleto-spec` (igual que el paquete npm sin scope).
- Publisher: `damianarganaras` (dueño del repo; supuesto a corregir si se usa otro ID — colaboradores: damianarganaras, Lubonch). Licencia MIT visible en la ficha.
- Estrategia: thin-wrapper (opción A) — confirmada, sin fork.
- Versionado único: `.vsix` sigue a `package.json` (sincronizado por `scripts/build-vsix.js`).

## Matriz de paridad CLI ↔ Command Palette

| CLI | Comando VS Code | Vía |
|---|---|---|
| `ancleto install [--project]` | `Ancleto: Install` | terminal integrado (cwd = workspace) |
| `ancleto update` | `Ancleto: Update` | terminal integrado |
| `ancleto upgrade` | `Ancleto: Upgrade` | terminal integrado |
| `ancleto init` | `Ancleto: Init` | terminal integrado |
| `ancleto discovery [--check]` | `Ancleto: Discovery` / `Ancleto: Discovery Check` | terminal integrado |
| `ancleto memory context\|list\|doctor` | `Ancleto: Memory Context/List/Doctor` | terminal integrado |
| `ancleto mcp` | `Ancleto: MCP Server Info` | terminal integrado (info; el server lo configura el IDE) |
| `ancleto doctor` | `Ancleto: Doctor` | Output Channel `Ancleto` |
| `ancleto check` | `Ancleto: Check` | Output Channel `Ancleto` |
| `ancleto stats` | `Ancleto: Stats` | terminal integrado |
| `ancleto specs check` | `Ancleto: Specs Check` | terminal integrado |
| `ancleto export` | `Ancleto: Export Project` | terminal integrado |
| `ancleto import` | `Ancleto: Import Project` | terminal integrado |
| `/cleto-new`, `/cleto-propose`, `/cleto-apply`, `/cleto-verify`, `/cleto-archive`, `/cleto-bulk-archive`, `/cleto-continue`, `/cleto-explore`, `/cleto-ff`, `/cleto-onboard`, `/cleto-recall`, `/cleto-sync`, `/cleto-transplant` (13) | `Ancleto: cleto-*` (13) | envía el texto `/cleto-*` al terminal integrado |
| `ancleto memory export/import/gc` (M1/M2 v0.7.0, planificado) | — | fuera de alcance hasta implementarse en el CLI |

## Definiciones de Fase 2 (2026-09-30)

- Contenido del `.vsix`: `src/`, `agents/`, `commands/`, `skills/`, `templates/`,
  `profiles/` + shim (`vscode-extension/src/extension.ts`, `package.json`,
  `resources/icon.png`, `README.md`). Excluye `test/`, `docs/`, `aspec/`, `.ancleto/`,
  `.github/`, `.opencode/`. Auditoría: el manifiesto final no declara
  `dependencies` (falla el build si aparecen).
- `scripts/build-vsix.js` (`npm run build:vsix`): 1) lee versión de `package.json`
  raíz; 2) sincroniza núcleo+assets a `vscode-extension/dist/`; 3) genera
  `vscode-extension/package.json` con esa versión; 4) corre `vsce package`
  (omitible con `SKIP_VSCE=1` para validar solo la sincronización). Idempotente y
  sin edición manual de lo derivado.
- Workflow `.github/workflows/publish-vsix.yml`: trigger tags `v*` (+
  `workflow_dispatch`), job paralelo al publish npm: `npm ci` → `node --test` →
  `npm run build:vsix` → publish a VS Marketplace (`VSCE_PAT`) y Open VSX
  (`OVSX_PAT`) con la misma versión. Secrets solo por nombre, nunca en el repo.
- Zero-dependencies: la extensión solo admite `devDependencies` de build
  (`@types/vscode`, `@vscode/vsce`); el runtime usa el Node del host + el núcleo
  ancleto (JS puro + `node:sqlite` nativo).
- Node ≥ 24: `activate()` compara `process.version`; si no cumple, muestra error
  y no registra comandos (degradación explícita, sin crash).
- Esbozo de `contributes`: `activationEvents: onStartupFinished` +
  `onCommand:ancleto.*`; `commands` con los IDs `ancleto.*` de la matriz de
  paridad (títulos `Ancleto: ...`, categoría `Ancleto`); sin vistas propias en v1
  (paleta + terminal integrado + Output Channel `Ancleto`).

## Validation

Al ser solo planning, la validación es documental:
- `proposal.md`, `design.md`, `tasks.md` y delta spec existen y son coherentes entre sí.
- Matriz de paridad CLI ↔ comandos VS Code completa y sin huecos.
- Restricciones verificadas contra `PRODUCT.md`: zero-dependencies, Node ≥ 24, Conventional Commits, no destructivo sin confirmación.
- Criterio de salida: un implementador futuro puede ejecutar `tasks.md` sin decisiones abiertas (publisher, nombre, bundling y activación ya decididos).
- Validación futura (fuera de scope, registrada en tasks): `vsce package`, instalación local del `.vsix`, `Extension Development Host` con `node --test` equivalente, y publish dry-run.
