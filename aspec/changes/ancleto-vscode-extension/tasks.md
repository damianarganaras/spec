# Tasks: Extensión de VS Code para ancleto

> Alcance de este change: planning (Fases 1-2) + continuación a implementación (Fases 3-5) — decidido con el usuario el 2026-09-30.

## Fase 1 — Decisiones de distribución (este change)

- [ ] Confirmar nombre y publisher de Marketplace (`ancleto-spec`; publisher `damianarganaras` como supuesto a corregir) y licencia MIT visible en la ficha.
- [ ] Confirmar estrategia thin-wrapper (reutilizar `src/cli/index.js` y assets) frente a fork completo.
- [ ] Confirmar versionado único npm + `.vsix` atado a `package.json`.
- [ ] Registrar matriz de paridad CLI ↔ Command Palette (`install`, `update`, `discovery`, `memory`, `mcp`, `doctor`, `/cleto-*`).

## Fase 2 — Diseño de empaquetado y pipeline (este change)

- [ ] Definir contenido del `.vsix` (incluir `agents, commands, skills, templates, src`; excluir `test, docs, documentation`).
- [ ] Definir script de transformación npm → vsix (`scripts/build-vsix.js` / `npm run build:vsix`): copia/sincroniza código y versión, genera el layout de la extensión, corre `vsce package`; nada derivado se edita a mano.
- [ ] Definir workflow GitHub → Marketplace (`.github/workflows/publish-vsix.yml` en tags `v*`, paralelo a npm: test → build vsix → publish a VS Marketplace con `VSCE_PAT` y Open VSX con `OVSX_PAT`).
- [ ] Definir política zero-dependencies para la extensión (solo `devDependencies` de build: `@types/vscode`, `@vscode/vsce`).
- [ ] Definir manejo de Node ≥ 24 en host VS Code (chequeo en `activate()` + mensaje de degradación).
- [ ] Esbozar `contributes` (commands, views, activationEvents) sin implementarlo.

## Fase 3 — Scaffold (este change, continuación)

- [ ] Crear `vscode-extension/package.json` con `engines.vscode`, `activationEvents`, `contributes.commands`.
- [ ] Crear `vscode-extension/src/extension.ts` con `activate()`/`deactivate()` y registro de comandos.
- [ ] Verificar con Extension Development Host (`F5`) que la extensión activa sin errores.

## Fase 4 — Paridad funcional (este change, continuación)

- [ ] Mapear `ancleto install/update` a `Ancleto: Install/Update` sobre el workspace abierto.
- [ ] Mapear `discovery/memory/mcp/doctor/stats/check` a Output Channel o terminal integrado.
- [ ] Exponer los 12 comandos `/cleto-*` como comandos de paleta (13 con `cleto-transplant`, agregado posterior por `cross-machine-export-import`).
- [ ] Verificar `node --test test/*.test.js` sigue en verde y sin nuevas dependencias de runtime.

## Fase 5 — Publish (este change, continuación)

- [ ] Implementar script de transformación npm → vsix y validar que un cambio en npm se refleja en un `.vsix` nuevo con solo correr el build.
- [ ] Validar `vsce package` genera `.vsix` instalable localmente (`code --install-extension`).
- [ ] Agregar job CI para publicar a VS Marketplace + Open VSX en tags `v*` en paralelo a npm.
- [ ] Publicar README, icono, categorías y changelog en la ficha de Marketplace.
