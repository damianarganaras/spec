---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter, MCP, tiers, matriz offline de hosts y diagnósticos"
covers: [instalación, hosts, frontmatter, MCP, tiers, templates, import-export, import de memoria, matriz de hosts, check, doctor, judge, publicación, working-context]
sources: ["src/cli/index.js", "src/cli/ui.js", "src/core/adapters/frontmatter.js", "src/core/model-declarations.js", "src/core/model-catalog.js", "src/core/tier-models.js", "src/core/judge.js", "src/core/machine-env.js", "agents/**", "commands/**", "skills/**", "templates/**", "profiles/**", "opencode.json", "package.json", ".github/workflows/publish.yml", "test/host-matrix.test.js"]
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
skillVersion: '2.3'
---

# Unidad: CLI e instalación

## Propósito

`src/cli/index.js` es el entry point único del paquete y el dueño del ciclo de vida: inicializa
un proyecto, instala o actualiza los assets en el layout nativo de cada host, configura el MCP,
aplica el tier de modelos, importa/exporta proyectos y expone los diagnósticos. `src/cli/ui.js`
aporta la UI de terminal.

## Recorrido relevante

### Instalación / inicialización

1. **Resolver alcance y host**: `install` detecta si se ejecuta dentro de un proyecto ancleto
   (`.ancletorc`) o si opera global; `--global` fuerza el alcance global. `resolveAgent` elige el
   host (`opencode`, `antigravity`, `commandcode`, `claude`, `vscode`, `copilot`, `cursor`, `roo`).
2. **Resolver tier antes de escribir**: `resolveTierMap` usa el catálogo y `tier-models.js`; si
   ningún candidato está disponible, aborta sin materializar un ID inventado. El tier solo se
   aplica a mirrors de opencode (los demás hosts eliminan `model:` o emiten `inherit`).
3. **Materializar assets**: `installAgentAssets` copia `agents/`, `commands/`, `skills/` y
   `templates/` al destino del host (`AGENT_TARGETS`/descriptor único). Antigravity empaqueta
   commands como skills (`<n>/SKILL.md`); copilot/vscode comparten `.github/prompts`.
4. **Adaptar frontmatter**: `copyDirTransformed` usa `adaptFrontmatter(content, host, assetKind,
   name)`; el adaptador es el único dueño de la transformación.
5. **Mergear templates**: `copyTemplates` reconcilia bloques planos legados y luego mergea solo los
   bloques `LOCKED` de `AGENTS.md`/`PRODUCT.md`; el contenido local fuera de ellos se preserva.
6. **Configurar MCP**: `setupHostMcp` resuelve el destino del host y hace merge no destructivo. El
   servidor propio `ancleto-memory` se agrega junto con los servidores por defecto.
7. **Persistir**: escribe `.ancletorc` (manifiesto + `installedPaths`), el estado de tier
   (`.opencode/.ancleto-tier`) y refresca `machine-env.md` y `working-context.md` de forma
   best-effort. El refresh del working-context usa el presupuesto resuelto por
   `working-context.js`; un fallo (p. ej. una `criticalKey` inválida) no aborta el lifecycle, pero
   tampoco persiste un bloque degradado.

`init` agrega el scaffold de `aspec/`, la migración de `openspec/` legacy y el registro global del
proyecto. `upgrade` materializa la canónica sin aplicar tier. `update` reintenta la instalación
sobre el manifiesto existente.

### Matriz de hosts y ciclo de vida (0.43.1)

`test/host-matrix.test.js` es una matriz determinista y **offline** sobre los 8 hosts declarados ×
`init`/`install`/`update`/`upgrade`/`import --repair` (sin bundle). No invoca hosts reales,
binarios de host ni red. Verifica:

- destino nativo y convención de nombre por asset (incluido `.agent.md` de vscode y `.prompt.md` de
  copilot/vscode);
- cobertura soportada (cursor/roo sin agents ni commands; copilot sin skills);
- MCP por host y ausencia de `.opencode/opencode.json` en hosts sin destino;
- templates `LOCKED` actualizados y `EXTENSIBLE` preservado;
- idempotencia y no destrucción entre ejecuciones;
- deriva de manifiesto entre `init`/`upgrade` repetidos.

Dos decisiones del test importan para cambios futuros: usa un mapa `HOSTS` propio como **oráculo
independiente** del descriptor de producción, y fija tier `normal` (no `minimo`) para que la
aplicación de tier sea observable. Change archivado:
`aspec/changes/archive/2026-11-21-ch-10-host-matrix-hardening/`; requirement promovido a
`aspec/specs/agent-install-routing/spec.md`.

### Import / export de proyecto

- `export` produce un bundle portátil con allowlist: no copia `opencode.json` (rutas absolutas),
  `.ancleto-tier`, `memory.db`, `service.json` ni la config global.
- `import` restaura templates/assets/manifiesto, repara el MCP del host y aplica el tier solo en
  opencode. Un fallo del catálogo se resuelve **antes** del primer write para no dejar el import a
  medio aplicar.

### `memory import` (0.43.0)

`memoryImport` lee el JSON, ejecuta `validateImportEntries` como pre-check y recién después crea el
engine. Un archivo inválido (incluido `scope` no-string) reporta `ancleto: import invalido: …` con
exit 1 **sin abrir ni crear la base**; el mismo contrato lo aplica el dry-run. Evidencia:
`src/cli/index.js`, `src/core/memory/engine.js`.

### Diagnósticos

- `check`: valida assets esperados, huérfanos, frontmatter contra el adaptador, deriva de tier,
  catálogo de modelos, MCP del host, spec canónicas y entorno de máquina. Es advisory: las
  divergencias no cambian el exit; los faltantes sí.
- `doctor`: valida la configuración MCP del host activo y cae a la config global solo si no hay
  destino de proyecto.
- `judge`: adaptador advisory a `jev-spec` (ver `integrations.md`).

### Release

Un tag `v*` dispara `.github/workflows/publish.yml` (lint, tests, publish idempotente, Release y
canary no bloqueante). `0.43.1` está **preparada, sin push**: `package.json` y `CHANGELOG.md`
declaran la versión (commit `7758d46`) y existe el tag anotado local `v0.43.1` (objeto `fce834b`),
pero el backlog no registra run. La última publicada y verificada es `0.43.0` (tag anotado
`v0.43.0` → `9a7220c`, run `44827344442` `success`, npm `latest`). Antes, `0.42.0` (tag anotado
`v0.42.0` → `c6319c8`, run `44808502480` `success`, npm `latest`).

## Reglas, contratos y riesgos

- **Un único dueño del frontmatter**: `src/core/adapters/frontmatter.js`. Agregar una rama de
  transformación en otro archivo duplica el contrato.
- **Hosts sin formato documentado**: cursor/roo y hosts desconocidos son passthrough con aviso;
  nunca se inventa un ID de tool.
- **Assets no soportados**: se omiten con aviso no bloqueante y no dejan rastro en
  `installedPaths`.
- **MCP no destructivo**: se preservan servidores y claves existentes; un JSON inválido se avisa
  sin sobrescribir. No se toca la config global si hay destino de proyecto.
- **Tiers**: el estado de tier puede quedar “huérfano” si no hay agentes locales donde aplicarlo;
  `check` lo advierte. `gratis` tiene un único modelo conocido y normaliza un `gratisModel`
  desconocido.
- **Templates `LOCKED`**: un bloque mal formado no se toca; las firmas legadas solo se eliminan con
  coincidencia exacta.
- **Working-context en lifecycle**: el refresh es best-effort y comparte el render/presupuesto con
  `memory context`; el lifecycle no debe persistir un bloque degradado.
- **Pre-check de `memory import`**: la validación se hace antes de abrir la base para no crear
  `.ancleto/memory.db` ante un archivo inválido; no reimplementar el esquema en el CLI.
- **Matriz offline**: cualquier cambio de ruteo debe pasar `test/host-matrix.test.js`; actualizar
  el oráculo `HOSTS` para “hacer pasar” una regresión rompe el contrato.
- **Riesgo principal**: `src/cli/index.js` concentra demasiadas responsabilidades; los cambios
  deben aislarse por subcomando y apoyarse en los módulos de `src/core/**`.

## Paths clave

| Path | Rol |
| --- | --- |
| `src/cli/index.js` | Dispatch, instalación, MCP, tiers, import/export, `memory import` y diagnósticos |
| `src/cli/ui.js` | Banner animado y menús TTY |
| `src/core/adapters/frontmatter.js` | Transformación de frontmatter por host |
| `src/core/tier-models.js` | Tabla de tiers, cadenas y resolución |
| `src/core/model-declarations.js` | Collector de declaraciones versionadas de modelo |
| `src/core/model-catalog.js` | Helpers puros del catálogo |
| `src/core/judge.js` | Adaptador advisory a `jev-spec` |
| `src/core/machine-env.js` | Detección de shell/EOL/tools y exclusión git |
| `src/core/memory/working-context.js` | Render y presupuesto del artefacto refrescado por el lifecycle |
| `src/core/memory/engine.js` | `validateImportEntries`, usado como pre-check por el CLI |
| `test/host-matrix.test.js` | Matriz offline de 8 hosts × operaciones de ciclo de vida |
| `agents/**`, `commands/**`, `skills/**`, `templates/**`, `profiles/**` | Superficie instalable |
| `package.json` | Bins, versión, engines y scripts |
| `.github/workflows/publish.yml` | Pipeline de publicación y Release |
| `aspec/backlog.md` | Estado de release y seguimiento de deuda |
