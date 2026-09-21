# ancleto CLI — AI Tooling Framework

Estandariza la configuración de IA de opencode en tus repositorios con governance
automática, workflows aspec y skills especializados, optimizado para costo/tokens.

## Introducción

### ¿Qué es el AI Tooling Framework?

`@ancleto/spec` (binarios `ancleto` y `aspec`) es un toolkit personal de desarrollo
asistido por IA para opencode. Proporciona:

- **Agentes especializados (10)**: orchestrator, coder, tester, spec-writer, reviewer,
  documenter, technical-discovery, technical-seed-writer, memory-keeper, context-resolver.
- **Workflows aspec**: comandos `cleto-*` (`/cleto-new`, `/cleto-apply`, `/cleto-verify`,
  etc.) para cambios estructurados.
- **Skills reutilizables (7)**: `ancleto-commit`, `ancleto-pr`, `ancleto-technical-discovery`,
  `ancleto-upgrade`, `triage-clarifier`, `ancleto-recall`, `ancleto-sync-specs`.
- **Governance**: templates `AGENTS.md`, `PRODUCT.md` instalables en cada repo.
- **Motor de memoria (v0.2.0)**: base local `.ancleto/memory.db` sobre `node:sqlite`
  (zero-deps) con 3 tools para el LLM y supersesión atómica.
- **Descubrimiento técnico**: `ancleto discovery` empaca el repo con Repomix y
  audita la frescura del technical seed.

### ¿Por qué usarlo?

| Problema | Solución |
| --- | --- |
| Inconsistencia en configs de IA entre repos | Governance con `AGENTS.md`, `PRODUCT.md` |
| Procesos ad-hoc sin documentación | Workflows aspec estandarizados (`cleto-*`) |
| Cambios grandes sin análisis | Agents especializados con roles + clasificación `triage-clarifier` |
| Commits sin semántica | Skill `ancleto-commit` con conventional commits |
| Migraciones manuales y propensas a errores | Skill `ancleto-upgrade` que analiza y planifica |
| Costo de tokens descontrolado | Tiers `normal \| minimo \| gratis` + modelos opencode-go |
| Memoria entre sesiones inexistente | Motor de memoria persistente con rules/decisions |

## Arquitectura

El framework funciona en dos capas.

### Capa 1: Governance (LOCKED)

Recursos gestionados por `ancleto install`:

```
.
├── AGENTS.md                  (LOCKED)     - Contexto del proyecto
├── PRODUCT.md                 (EXTENSIBLE) - Datos del producto y metadata
├── .ancletorc                 (generado)   - Config del proyecto (azure, discovery)
├── .ancleto-tier              (generado)   - Nivel de costo elegido
└── .opencode/
    ├── agents/                (LOCKED)     - orchestrator, coder, tester, ...
    ├── commands/              (LOCKED)     - cleto-*.md
    └── skills/                (LOCKED)     - skills base y de perfil ancleto
```

Los destinos administrados existentes se preservan: el instalador pregunta antes de
sobrescribir y fusiona la config MCP sin pisar nada.

### Capa 2: Extensible (CUSTOMIZABLE)

Recursos que podés personalizar (el installer no los sobrescribe):

```
├── PRODUCT.md                 (EXTENSIBLE) - Project Type, Tech Stack, ...
├── .opencode/skills/                        - skills locales de tu equipo
└── aspec/
    ├── changes/                             - Cambios activos y archivados
    ├── specs/                               - Especificaciones del proyecto
    └── config.yaml                          - (nunca se reemplaza)
```

opencode es el único cliente soportado: todo lo administrado se materializa bajo
`.opencode/`.

## Instalación del CLI

```bash
npm i -g @ancleto/spec
```

Requiere Node.js >= 24.0.0 (el motor de memoria usa `node:sqlite`).

## Comandos ancleto

### `ancleto install` — Instalar el framework

```bash
ancleto install                          # global: disponible en todos tus proyectos
ancleto install --project /ruta/repo     # por proyecto: .opencode/ + templates en la raiz
ancleto install --no-mcp                 # igual, sin tocar la config MCP de opencode
ancleto install --tier normal|minimo|gratis   # elige nivel de costo (pregunta en la 1ra config)
```

Configura por defecto los MCP locales **engram** (memoria persistente) y **caveman**
(compresión de contexto) en `~/.config/opencode/opencode.json`, fusionándose con la
config existente. Si un binario no se encuentra en el sistema, ese MCP se omite con un
warning (no falla la instalación).

### `ancleto update` — Actualizar

```bash
ancleto update [--project <dir>]
```

Alias de `install` sobre lo existente. Re-aplica el tier guardado en `.ancleto-tier`
sin volver a preguntar.

### `ancleto init` — Inicializar un proyecto

```bash
ancleto init                     # prepara .ancletorc en el repo actual (Azure off)
ancleto init --with-azure        # lo mismo, con Azure DevOps habilitado
```

### `ancleto discovery` — Descubrimiento técnico

```bash
ancleto discovery --check              # estado del seed: READY/STALE/PARTIAL/MISSING
ancleto discovery [--compress] [--include G] [--ignore G] [--token-budget N]
```

Empaca el repo con Repomix (se resuelve vía `npx` si no está instalado) y guarda el
estado en `docs/technical-discovery/.discovery-state.json`. `--check` audita la
frescura por hash de contenido sin re-empacar.

### `ancleto --help` / `ancleto --version`

Ayuda del CLI y versión del paquete.

## Tiers de costo

En la primera configuración se pregunta el nivel de gasto; también se elige con `--tier`:

```bash
ancleto install --tier normal     # modelos opencode-go balanceados (default)
ancleto install --tier minimo     # todo al modelo pagado mas economico viable
ancleto install --tier gratis     # solo modelos gratuitos (ej. opencode/big-pickle)
```

Al llegar al tope mensual de la suscripción, opencode cae automáticamente a los modelos
gratuitos.

## MCP en opencode (Servidores de Contexto)

`ancleto install` configura servidores MCP locales en `~/.config/opencode/opencode.json`:

| Servidor | Tipo | Estado |
| --- | --- | --- |
| `engram` | local | Habilitado por defecto (memoria persistente entre sesiones) |
| `caveman` | local | Habilitado por defecto (compresión de contexto) |

Con `--no-mcp` se omiten ambos. Si un binario no existe en el sistema, se omite con warning.

## Motor de memoria (v0.2.0)

Base local por repositorio en `.ancleto/memory.db` (SQLite vía `node:sqlite`, zero-deps):

- **3 tools expuestas al LLM**: `searchMemory` (BM25/FTS5), `recordRule`, `recordDecision`.
- **Supersesión atómica**: misma `memory_key` → la versión nueva supersede la anterior
  en una transacción (`BEGIN IMMEDIATE`), una sola activa por clave.
- **Reglas**: se inyectan proactivamente en el System Prompt dentro del bloque
  `<ProjectMemoryRules>` etiquetado como datos no confiables.
- **Decisiones**: se recuperan reactivamente con `searchMemory`.

## Workflows Disponibles

### Workflow aspec (Cambios Estructurados)

Al iniciar una tarea con el agente Orchestrator, `triage-clarifier` clasifica el cambio:

- **direct-test-only**: testing de comportamientos existentes → se deriva al tester.
- **direct-implementation**: cambio local, pequeño y claro → se implementa directo.
- **spec-required**: cambio en comportamiento, reglas de negocio o arquitectura → flujo
  SDD completo, generando los artifacts para revisión antes de aplicar.

## Crear Skills Personalizados

Un skill es una función especializada que el agente IA ejecuta para automatizar una tarea.

### Local (solo en tu repo)

Crear en `.opencode/skills/tu-skill/SKILL.md` — disponible de inmediato, no necesita publicación.

### Compartido (para todos los repos)

Contribuir a `skills/` en el repositorio `github.com/damianarganaras/spec`. Al publicarse
una nueva versión del paquete, se distribuye vía `ancleto update`.

## Flujo completo (primera vez)

```bash
# 1. Requisitos
node -v                              # >= 24.0.0
# sin binarios extra: el ciclo de changes corre con las skills aspec

# 2. Instalar el framework
npm i -g @ancleto/spec
ancleto install --tier normal         # configura agents/commands/skills + MCPs

# 3. Inicializar un proyecto
cd mi-repositorio
ancleto init                          # crea .ancletorc

# 4. Generar el contexto técnico inicial
ancleto discovery                     # empaca el repo con Repomix
"Usá ancleto-technical-discovery para analizar este repositorio"

# 5. Empezar a trabajar
# en opencode: /cleto-new, /cleto-propose, /cleto-ff
```

## Troubleshooting

### El motor de memoria no arranca / `node:sqlite` falla

El motor requiere Node.js >= 24. Verificar:

```bash
node -v
```

Si el runtime es menor a 24, actualizar Node (el módulo nativo `node:sqlite` no existe
antes).

### El MCP de engram/caveman no aparece en opencode

`ancleto install` busca los binarios en PATH y solo usa un fallback si el archivo realmente
existe en disco. Los fallbacks dependen de la plataforma: en Windows
`~/go/bin/engram.exe` y `~/.caveman/bin/caveman-mcp.exe`; en Linux/macOS se prueban
`~/go/bin/engram`, `~/.local/bin/engram` y `~/.caveman/bin/caveman-mcp`. Si no los
encuentra, los omite con un warning. Verificar:

```bash
where engram
where caveman-mcp
```

En Linux/macOS, `which engram` / `which caveman-mcp`.

### `ancleto discovery` falla

Repomix se resuelve vía `npx -y repomix` (primera corrida descarga el paquete, puede
tardar). Si falla con permisos de red, instalarlo manualmente:

```bash
npm i -g repomix
```

### Ver qué está fallando en detalle

```bash
ancleto discovery --check      # estado del seed con recommendedAction
node -v                        # runtime del motor de memoria
```

### (Windows) `ancleto discovery` con `npx.cmd`

El CLI invoca Repomix con `shell: true` para soportar `.cmd` en Windows. Si aparece un
error EINVAL, asegurate de que `npx` esté en PATH.

## Actualizar el CLI

Cuando se libera una nueva versión:

```bash
npm i -g @ancleto/spec@latest
ancleto update        # re-instala y re-aplica el tier guardado
```

Regla de release del proyecto: todo commit de feature lleva su version bump, así
`npm publish` nunca colisiona con una versión ya publicada.