# Tasks: ch-00-baseline

> Change doc-only. Lo ejecuta `@general` después de medir; no modifica código de producto.
> Entorno declarado en `.ancleto/machine-env.md`: win32, PowerShell 5.1, EOL `lf`, `rg` no disponible (usar `Select-String`).
> Prohibido: escrituras a `.ancleto/memory.db` (MEM-01), JEV/Lucas, cualquier cuenta paga, release/tag.

## 1. Fijar metadatos del baseline

- [ ] 1.1 Registrar commit y tag del repo (`git rev-parse HEAD`, `git describe --tags --always`), fecha/hora y branch.
- [ ] 1.2 Registrar runtime: versión de Node, npm y `ancleto` (`node --version`, `npm --version`, versión del CLI).
- [ ] 1.3 Registrar host/OS, shell declarado y EOL.
- [ ] 1.4 Registrar perfil/tier, host activo y modelos por agente leyendo el frontmatter `model:` de `agents/*.md`, `.opencode/agents/*.md` y `~/.config/opencode/agents/*.md`.
- [ ] 1.5 Registrar la config MCP efectiva (archivo resuelto + hash) sin modificarla.

## 2. Verificar guards read-only

- [ ] 2.1 Ejecutar `node src/cli/index.js check`; registrar salida y exit code (esperado `0 faltantes, 0 huerfanos`, exit 0).
- [ ] 2.2 Ejecutar `node src/cli/index.js doctor`; registrar salida y exit code.
- [ ] 2.3 Ejecutar `node src/cli/index.js discovery --check`; registrar JSON y exit code.
- [ ] 2.4 Ejecutar `npm run lint` (validación declarada) y registrar resultado; `format` no configurado.

## 3. Golden tests

- [ ] 3.1 Ejecutar `npm test` y registrar verde/rojo, conteo, duración y fecha.
- [ ] 3.2 Registrar ruta + hash de los artefactos o logs de la corrida como referencia de golden tests.

## 4. Extraer `stats` histórico y mapear arquetipos

- [ ] 4.1 Ejecutar `node src/cli/index.js stats --json` con los flags de ventana aplicables (`--all`, `--session`, `--limit N`, `--since YYYY-MM-DD`) sobre la DB de opencode; guardar el JSON crudo.
- [ ] 4.2 Registrar totales: input, output, reasoning, cacheRead, cacheWrite, USD, wall time y errors.
- [ ] 4.3 Registrar los mismos campos por agente.
- [ ] 4.4 Mapear a los 3 arquetipos (fix de conformidad, feature con delta, cambio de adapter/contrato compartido) más 1 prueba de recuperación de memoria y 1 de continuidad entre sesiones. Si `stats` no expone etiquetas, registrar la limitación y el criterio de mapeo usado.
- [ ] 4.5 Calcular cuentas de cache sólo con semántica de proveedor validada; lo no validado se registra en `unknowns`. No inventar costos ni ratios con denominadores ambiguos.

## 5. Inspeccionar mirrors

- [ ] 5.1 Comparar `agents/*.md` (canónica), `.opencode/agents/*.md` (mirror del proyecto) y `~/.config/opencode/agents/*.md` (global); registrar si son mirrors y qué divergencias hay.
- [ ] 5.2 Comparar las skills instaladas contra su fuente y registrar si son mirrors y qué divergencias hay.

## 6. Redactar el documento de baseline

- [ ] 6.1 Crear `docs/baseline/CH-00-2026-11-20.md` con esta estructura mínima:
  - [ ] metadatos (commit/tag, fecha, Node, npm, ancleto, host, perfil/tier, modelos, config MCP)
  - [ ] mirrors (skills/agents: sí/no, divergencias)
  - [ ] doctor/diagnostics (`check`, `doctor`, `discovery --check`: salida + exit)
  - [ ] stats + arquetipos (totales, por agente, mapeo y limitaciones)
  - [ ] golden tests (comando, conteo, duración, artefactos)
  - [ ] comandos reproducibles (exactos, con flags y orden)
  - [ ] unknowns/limitaciones
  - [ ] fecha/commit del baseline
- [ ] 6.2 Verificar que cada comando reproducible se pueda correr desde el commit fijado sin pasos implícitos.
- [ ] 6.3 Verificar que el documento no contenga datos de JEV/Lucas ni de cuentas pagas.

## 7. Validar y archivar

- [ ] 7.1 Validar que todos los campos de la estructura mínima estén presentes y no vacíos (o marcados `unknown` con motivo).
- [ ] 7.2 Confirmar ausencia de cambios en producción (`src/**`, `aspec/specs/**`, `.ancletorc`, `.opencode/**`, `.ancleto/memory.db`) y que sólo cambiaron los artefactos del change + el documento de baseline.
- [ ] 7.3 Archivar con `ancleto-archive`; sin delta de specs (doc-only).
