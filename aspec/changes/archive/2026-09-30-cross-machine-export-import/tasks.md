# Tasks: Export / Import entre máquinas (portabilidad de proyecto)

## Fase 1 — `ancleto export`

- [x] Implementar recolección de portables (`.ancletorc`, templates, `aspec/`, skills, commands, agents con tier aplicado).
- [x] Implementar `manifest.json` (versión, agente, tier, idioma, flags, MCP por nombre+tipo, sin paths absolutos).
- [x] Implementar salida a directorio y `--tar bundle.tgz`, con lista de exclusión (credenciales, `service.json`, global, `memory.db`).
- [x] Tests: manifiesto sin absolutos ni secretos; bundle sin datos de sesión.

## Fase 2 — `ancleto import` e `import --repair`

- [x] Implementar aplicación de portables reutilizando `copyAssets`/`copyTemplates`/`applyTier`/`installAgentSkills`/`scaffoldAspec`.
- [x] Implementar regeneración MCP vía `buildDefaultMcp`/`resolveBin`/`resolveSelfCommand` + `mergeMcp` (solo ausentes o rotas).
- [x] Implementar `import --repair` (regenera entradas con `command` inexistente, deja sanas intactas).
- [x] Cerrar con `doctorCommand` y reporte; aviso de divergencia de versiones sin bloquear.

## Fase 3 — Wrapper y repro real

- [x] Agregar wrapper `/cleto-transplant` (markdown: cuándo correr export/import).
- [x] Repro Windows→Linux (fixture con rutas Windows + import en Linux): `doctor` verde y MCP spawneable.
- [x] Suite `node --test` en verde.
