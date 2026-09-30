# Design: Export / Import entre máquinas (portabilidad de proyecto)

## Approach

Separar lo **portable** (intención) de lo **local** (rutas). `ancleto export` agrupa en
un bundle los activos portables del proyecto y un `manifest.json` que para el MCP
guarda solo nombres+tipos de servers habilitados, nunca `command`/`args` con paths
absolutos. `ancleto import` aplica los portables y **regenera** las entradas MCP con
el código existente (`buildDefaultMcp`, `resolveBin`, `resolveSelfCommand`), que ya
sabe resolver binarios del host actual; termina corriendo `doctorCommand` como
validación. `import --repair` hace lo mismo sin bundle: recorre el `opencode.json`
del proyecto y regenera cada entrada cuyo `command` no exista (`existsSync`, el mismo
criterio de `resolveBin`). Se implementa como subcomandos CLI reales (no markdown),
porque requieren spawnear procesos, probar binarios y escribir config.

Decisiones de diseño:
- Formato del bundle: `manifest.json` + carpetas, legible y diff-able a mano; salida directorio (`ancleto-export/`) o `--tar bundle.tgz`.
- Qué NO se exporta: credenciales, tokens, `service.json`, `opencode.jsonc` global, `memory.db` (futura opción `--with-memory`).
- `import` no pisa entradas MCP sanas del destino: solo agrega ausentes y regenera rotas.
- `manifest.json` incluye versión de ancleto origen; si difiere de la local, aviso sin bloquear.
- Wrapper `/cleto-transplant` opcional: instrucción markdown que le dice al agente cuándo correr `export`/`import` (no contiene la lógica).

## Architecture

```text
ancleto export [--tar bundle.tgz]        # máquina origen
├── lee .ancletorc, templates, aspec/, skills, commands, agents (tier aplicado)
├── MCP → solo intención: [{ name: 'ancleto-memory', type: 'local' }, ...]
├── manifest.json { ancletoVersion, agent, tier, language, gratisModel, flags, mcp[] }
└── excluye: credenciales, service.json, opencode.jsonc global, memory.db

ancleto import <bundle> [--repair]       # máquina destino
├── aplica activos portables (reusa copyAssets/copyTemplates/applyTier/installAgentSkills/scaffoldAspec)
├── regenera MCP vía buildDefaultMcp/resolveBin/resolveSelfCommand + mergeMcp
├── --repair: sin bundle, regenera entradas con command inexistente
└── corre doctorCommand y reporta

/cleto-transplant (wrapper markdown opcional)
└── "corré ancleto export acá / ancleto import allá"
```

## Validation

- Tests con fixture: `export` genera bundle cuyo manifiesto no contiene paths absolutos ni secretos.
- Repro del caso real: bundle exportado con rutas Windows + `import` en Linux → `opencode.json` con rutas locales válidas y `ancleto-memory` spawneable (`doctor` verde).
- `import --repair` sobre fixture con `command` inexistente lo regenera y deja intactas las entradas sanas.
- El bundle no contiene credenciales ni datos de sesión (test de exclusión).
