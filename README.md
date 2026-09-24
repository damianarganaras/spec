<div align="center">

# ANCLETO (aspec)

**Orquestador SDD (Spec-Driven Development) y toolkit personal asistido por IA**

[![Version](https://img.shields.io/npm/v/@ancleto/spec?style=flat-square&label=version&color=4f46e5)](https://www.npmjs.com/package/@ancleto/spec)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2024-43853D?style=flat-square&logo=node.js&logoColor=white)](#requisitos)
[![Dependencies](https://img.shields.io/badge/dependencies-0-0d9488?style=flat-square)](#requisitos)
[![Agents](https://img.shields.io/badge/agents-10-334155?style=flat-square)](#caracter%C3%ADsticas-principales)
[![Skills](https://img.shields.io/badge/skills-18-06b6d4?style=flat-square)](#caracter%C3%ADsticas-principales)

<sub>Descubrimiento técnico, memoria persistente y control estricto de tokens para tu IDE.</sub>

</div>

---

## Tabla de contenidos

- [¿Qué es Ancleto?](#qué-es-ancleto)
- [¿Por qué fue creado?](#por-qué-fue-creado)
- [Características principales](#características-principales)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Guía de .gitignore](#guía-de-gitignore)
- [Configuración y tiers de costo](#configuración-y-tiers-de-costo)
- [Uso rápido](#uso-rápido)
- [Proyectos con ancleto](#proyectos-con-ancleto)
- [Referencia de comandos CLI](#referencia-de-comandos-cli)
- [Motor de memoria persistente](#motor-de-memoria-persistente)
- [Comandos del ciclo SDD en tu IDE](#comandos-del-ciclo-sdd-en-tu-ide)
- [Azure DevOps (opcional)](#azure-devops-opcional)
- [Referencia: agentes y modelos por tier](#referencia-agentes-y-modelos-por-tier)

---

## ¿Qué es Ancleto?

**Ancleto** (alias de CLI: `aspec`) es un orquestador ligero para desarrollo de software asistido por IA bajo el paradigma **SDD (Spec-Driven Development)**.

Vive dentro de tu entorno de desarrollo (OpenCode, Cursor, VS Code, Roo, etc.) y automatiza tres cosas que normalmente hacés a mano:

- **Especificar** — escritura guiada de especificaciones y planes de implementación.
- **Descubrir** — relevamiento topológico del repositorio y empaquetado de contexto.
- **Recordar** — retención de decisiones técnicas y reglas del proyecto entre sesiones.

Todo envuelto en una CLI interactiva construida bajo una política estricta de **cero dependencias**.

## ¿Por qué fue creado?

Al trabajar en repositorios complejos con asistentes de IA aparecen tres problemas recurrentes:

1. **Memoria frágil.** Los agentes olvidan convenciones y decisiones arquitectónicas apenas se limpia la ventana de contexto.
2. **Costo oculto.** Empaquetar un monorepo entero para dar contexto consume presupuestos de tokens y encarece cada consulta.
3. **Falta de método.** Cada agente improvisa, sin un ciclo de vida definido: especificación → revisión → implementación → verificación.

Ancleto resuelve esto centralizando las reglas de negocio en un motor de memoria local (`node:sqlite`), empaquetando el contexto según tu nivel de suscripción (tiers) y orquestando **10 subagentes nativos** para que el código que escribe la IA respete tus estándares.

---

## Características principales

**Catálogo multi-agente (10 agentes)** — Orchestrator, Coder, Tester, Spec-Writer, Reviewer, Documenter, Technical-Discovery, Technical-Seed-Writer, Memory-Keeper y Context-Resolver. Cada uno con su modelo asignado según el tier.

**Motor de memoria persistente (FTS5)** — Base local SQLite (`.ancleto/memory.db`) que expone al LLM herramientas para registrar y recuperar reglas arquitectónicas y decisiones pasadas. Sin bases vectoriales.

**Discovery engine** — Escáner topológico que genera `.discovery-map.json` y empaqueta el repositorio vía Repomix con presupuesto de tokens dinámico según el tier.

**Gestión de tiers de costo** — Control explícito sobre qué modelos y cuánto contexto se envía: `normal`, `minimo` y `gratis`.

**Agentic aspec engine** — Sin binarios externos. Las 11 skills del ciclo de vida (`new`, `propose`, `apply`, `verify`, `archive`, `bulk-archive`, `continue`, `explore`, `ff`, `onboard`, `workflow`) más las auxiliares (`ancleto-commit`, `ancleto-pr`, `triage-clarifier`, entre otras) se instalan e inyectan nativamente en tu IDE.

**Wizard interactivo** — Banner animado y menús navegables con flechas en `init` e `install`, sin librerías pesadas.

---

## Requisitos

| Requisito | Detalle |
|---|---|
| **Node.js ≥ 24.0.0** | Obligatorio: el motor de memoria usa el módulo nativo `node:sqlite`. |
| **Repomix** | Opcional: se resuelve vía `npx` cuando no está instalado globalmente. |

---

## Instalación

```bash
# Global (disponible en todos tus proyectos)
npm install -g @ancleto/spec

# O desde la propia CLI
ancleto install

# Acotada a un proyecto (inyecta templates y .opencode/)
ancleto install --project /ruta/repo

# Sin modificar la configuración MCP de tu IDE
ancleto install --no-mcp

# Actualizar conservando tus personalizaciones
ancleto update
```

> El instalador configura por defecto el MCP de **memoria propia** (`ancleto-memory`) y **caveman**. El MCP externo **engram** ya no se agrega por defecto: sumalo con `--with-engram` si además querés esa memoria. Si un binario no está en tu sistema, se omite con un warning sin interrumpir el flujo.

### Costo en tokens de los MCP

Los MCP no son gratis en contexto: la lista de herramientas de cada servidor viaja en **cada** request, se usen o no. Medición local:

| MCP | Herramientas | Tokens por request |
|---|---|---|
| `ancleto-memory` (memoria propia) | 3 | ~500 |
| caveman | 5 | ~830 |
| engram (solo con `--with-engram`) | 18 | ~4.900 |

Cómo bajarlo:

- Instalá con `--no-mcp` si no querés ninguno.
- Evitá `--with-engram` salvo que uses esa memoria: es el que más pesa (9× la memoria propia).
- Podés deshabilitar cualquier servidor en tu `opencode.json`: `"mcp": { "engram": { "enabled": false } }`.

Para medir el consumo **real** por sesión (no estimado): `ancleto stats` lee la base de sesiones de opencode y reporta tokens de entrada/salida/razonamiento/cache, costo y subagentes por sesión. Con `--session <id>` desglosa por agente y con `--since YYYY-MM-DD` permite comparar antes/después de una optimización. Solo funciona con opencode.

---

## Guía de .gitignore

El framework **no gestiona tu `.gitignore`**: es una decisión del proyecto. Como referencia, esta es la combinación que funciona bien con Ancleto:

| Ruta | Recomendación | Por qué |
|---|---|---|
| `aspec/` | **Versionar** | Es la fuente-de-verdad: specs y el historial de changes archivados. Si se ignora, el equipo pierde el por qué de las decisiones y los agentes no tienen contexto estable. |
| `.ancleto/` | **Ignorar** | Base SQLite local (memoria del repo y working-context). Es de tu máquina; cada integrante la regenera. |
| `.ancletorc` | **Decisión del equipo** | Versionarlo alinea la configuración del proyecto (agente, tier, discovery). Ignoralo si cada integrante lo personaliza. |

> Error común: gitignorear `aspec/` junto con `.ancleto/`. La memoria local es descartable; la fuente-de-verdad, no.

---

## Proyectos con ancleto

Cuando instalás ancleto **en un proyecto** (`install --project`, `init` o `update`), el CLI lo anota en un registro global (`~/.config/ancleto/projects.json`). Así podés ver de un vistazo todos los proyectos que lo usan, sin importar desde qué terminal estés:

```bash
ancleto projects            # lista (o `ancleto list --projects`)
ancleto projects info       # estado del proyecto actual
ancleto projects scan "D:/Repos D/Proyectos"   # descubre y registra los que ya existen
ancleto projects prune      # saca del registro los borrados/movidos
ancleto projects update     # actualiza los desactualizados (selector interactivo)
ancleto projects update --all   # los actualiza todos sin preguntar
```

`projects update` detecta qué proyectos quedaron atrás de la versión del CLI y te deja elegir cuáles actualizar (espacio para marcar, `a` para todos, enter para confirmar). Actualiza cada uno en un proceso aislado, así que un proyecto roto no afecta a los demás. Es el equivalente cómodo de `cd <ruta> && ancleto update` para cada uno. En una terminal sin TTY lista los desactualizados y te recuerda usar `--all`.

La lista muestra versión instalada, origen (por proyecto vs agentes globales), tier y agente:

```
ancleto: proyectos (2 activos de 3 registrados · CLI v0.6.28)

   PROYECTO        VERSIÓN   ORIGEN    TIER      AGENTE     RUTA
  ● App Coffice    0.6.28    scoped    minimo    opencode   D:/Repos D/Proyectos/App Coffice
  ● spec           0.6.28    scoped    normal    opencode   D:/Repos D/Proyectos/ancleto/spec
  ✖ Volatile        —         muerto    —         —          D:/Repos D/tmp/volatile
```

- `●` verde: instalación por proyecto · `○` amarillo: usa agentes globales · `✖` rojo: ruta inexistente (candidata a `prune`).
- Versión en rojo = desactualizada respecto del CLI instalado.
- `--json` en todos para scripting.

El registro es tuyo y local: no viaja con el repo ni se comparte. `ANCLETO_PROJECTS_FILE` permite apuntarlo a otro lado.

---

## Configuración y tiers de costo

En la primera ejecución, un **wizard interactivo** te guía por los pasos de configuración (agente/IDE y nivel de gasto). También podés pasarlos por flags:

```bash
ancleto init --agent opencode --tier normal --lang es
```

| Tier | Qué hace |
|---|---|
| `normal` | Modelos balanceados, sin restricciones agresivas de contexto. Es el default. |
| `minimo` | El modelo pago más económico viable, con alta compresión de contexto y exclusión de tests/docs en el discovery. |
| `gratis` | Modelos gratuitos, empaquetado agresivo y límite estricto de tokens. Prefiere **Muse Spark 1.3 Free** si tu cuenta lo tiene habilitado; si no, usa `opencode/big-pickle`. |

La configuración se preserva en `.ancletorc` (raíz del proyecto) y `.ancleto-tier` (junto a la configuración instalada).

### Idioma de los artifacts

El contenido de `proposal.md`, `design.md`, `tasks.md` y `specs/` se escribe en el idioma de tu conversación (`auto`, el default) o en el código que fijes con `--lang`:

```bash
ancleto init --lang auto   # detecta el idioma de tus primeros mensajes y lo guarda
ancleto init --lang es     # fija español para ese proyecto
```

Con `auto`, el orquestador detecta el idioma en tus primeros hasta 3 mensajes y lo persiste en `.ancletorc` → `language`. Podés volver a `auto` o fijar otro código cuando quieras (`auto | es | en | pt`). Lo que **nunca** se traduce: los keywords (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`) y los nombres de archivos y directorios.

### Exclusiones del discovery

En la instalación interactiva elegís qué excluir del seed técnico con un menú (tests, assets pesados, docs, migraciones/seeds, lockfiles). Excluir reduce el tamaño del pack y estabiliza la detección de cambios:

```bash
ancleto init --exclude "**/*.test.*,**/*.png,docs"   # sin menú, directo
```

Se guarda en `.ancletorc` → `discovery.exclude` y se preserva en `update`/`upgrade`.

### Frescura del seed (impact)

`ancleto discovery --check` no solo dice si el seed está `STALE`: dice **qué tan grave** es el cambio con `impact`:

| `impact` | Significado | Qué pasa |
|---|---|---|
| `none` | Sin cambios | El agente trabaja normal |
| `minor` | Cambios fuera de áreas materiales (un componente, un estilo) | El agente trabaja y lo anota en el resumen; **no ofrece regenerar** |
| `material` | Cambió un config de runtime, un entry point o apareció un directorio raíz nuevo | El agente **ofrece regenerar** (solo con tu aprobación) |

La excepción: si el agente detecta un **hueco concreto** (info que el seed debería tener y no tiene, como una paleta nueva sin unidad), puede ofrecer regenerar aunque el `impact` sea `minor` — siempre con tu aprobación. Nunca regenera solo.

### Regeneración parcial

`--check` también devuelve `affectedDocs`: los documentos del seed cuyas áreas cambiaron. Cuando aprobás una regeneración sobre un reporte `minor`, el seed-writer **reescribe solo esos documentos** y deja el resto intacto (un solo pack igual, pero sin reescribir los 8 documentos + dossiers). El mapeo vive en `seed-map.json` dentro del directorio del seed y lo mantiene la skill al generar; sin ese archivo el chequeo degrada a lista vacía y la regeneración es completa.

---

## Uso rápido

El ciclo diario consiste en preparar el terreno técnico para tu agente y después usar los comandos SDD dentro del IDE.

### 1. Inicializar el repositorio

```bash
cd tu-proyecto
ancleto init              # Crea .ancletorc, aspec/, AGENTS.md y PRODUCT.md
```

`init` **no pisa** lo que ya existe: si tu repo tiene su propio `AGENTS.md` o `PRODUCT.md`, los respeta (solo fusiona los bloques `<!-- LOCKED -->` del template). Además materializa `.ancleto/working-context.md` con tus reglas activas cuando hay memoria — es el bloque que el orquestador inyecta al arrancar.

> ¿Querés que el proyecto lleve **su propia** copia de agents/skills (sin depender de la instalación global)? Sumá `ancleto install --project .`.

### 2. Descubrir contexto técnico

```bash
ancleto discovery --check # Estado del technical seed (READY / STALE / PARTIAL / MISSING) + config
ancleto discovery         # Genera .discovery-map.json y empaqueta el repo
```

### 3. Trabajar con los comandos del IDE

```text
/cleto-new  y  /cleto-propose   planificar un feature
/cleto-verify  y  /cleto-apply  validar reglas, correr tests y aplicar el código
/cleto-archive                  consolidar el historial y registrar aprendizajes
```

---

## Referencia de comandos CLI

```bash
ancleto init [--agent <nombre>] [--tier <nivel>] [--lang <codigo>] [--exclude <globs>] [--with-azure]
                          # Configura el proyecto (interactivo en TTY)

ancleto install [--project <dir>] [--tier <nivel>] [--agent <nombre>] [--lang <codigo>] [--exclude <globs>] [--no-mcp]
                          # Instala agentes, skills y templates

ancleto update            # Re-instala la última versión sobre lo existente
                          # Parado en un proyecto con .ancletorc opera sobre ESE proyecto;
                          # usá --global para forzar el alcance global

ancleto upgrade           # Re-aplica templates y skills respetando tus personalizaciones

ancleto check             # Verifica la integridad de la instalación (faltantes / huérfanos)

ancleto specs check [--change <nombre>] [--json]
                          # Valida keywords canónicos en aspec/specs y en los deltas de un change

ancleto stats [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--json]
                          # Tokens por sesión de opencode (rollup de subagentes; --session desglosa por agente)

ancleto projects [list] [--json]
                          # Lista los proyectos que usan ancleto (versión, tier, origen, ruta)
ancleto projects scan <raíz> [--dry-run] [--json]
                          # Descubre y registra proyectos ancleto bajo una raíz
ancleto projects prune [--dry-run] [--json]
                          # Quita del registro los proyectos borrados o movidos
ancleto projects info [ruta] [--json]
                          # Estado de un proyecto (versión, memoria, seed, changes activos)
ancleto projects update [--all] [--json]
                          # Actualiza los desactualizados (selector interactivo);
                          # --all sin preguntar. Igual que "cd <ruta> && ancleto update"

ancleto doctor            # Diagnostica el entorno (Node, node:sqlite, opencode.json)

ancleto memory context [--scope <project|feature|task>] [--out <archivo>]
                          # Muestra el bloque de memoria activa del proyecto

ancleto memory list [--type rule|decision] [--scope project|feature|task] [--all] [--json]
                          # Lista los nodos de memoria (read-only: no toca la base)

ancleto memory doctor [--rebuild]
                          # Diagnostica la base de memoria, reconstruye el índice FTS5 y
                          # fusiona el WAL en el .db (deja la base segura para copiar)

ancleto mcp               # Servidor MCP de memoria propia (stdio): lo consume tu IDE

ancleto discovery [--compress] [--include <glob>] [--ignore <glob>] [--token-budget <n>]
                          # Empaqueta el repo con Repomix según tu tier
```

---

## Motor de memoria persistente

No hay bases de datos vectoriales: es **SQLite nativo** con búsqueda full-text (FTS5) y ranking BM25, en `.ancleto/memory.db`.

Funciona en tres piezas que comparten el mismo archivo:

| Pieza | Qué hace |
|---|---|
| **Almacenamiento** | Reglas y decisiones con supersesión atómica por `memory_key` (una sola activa por clave). |
| **Tools del LLM** (`ancleto mcp`) | Servidor MCP local, sin dependencias, que expone tres herramientas a tu IDE. |
| **CLI** | `ancleto memory context` materializa el bloque `<ProjectMemoryRules>`, `ancleto memory list` permite inspeccionar los nodos sin escribir, y `ancleto memory doctor` verifica integridad, reconstruye el índice FTS5 y fusiona el WAL. |

| Herramienta | Función |
|---|---|
| `searchMemory` | Recupera decisiones y reglas previas. Búsqueda léxica (FTS5/BM25) con fallback tolerante: intenta términos exactos y, si no hay coincidencia, reintenta por prefijos, así el lenguaje natural también encuentra. |
| `recordRule` | Guarda una regla o restricción permanente. |
| `recordDecision` | Registra el *por qué* de una decisión. |

Cada entrada tiene un `scope`: `project` (default, entra en `<ProjectMemoryRules>`), `feature` o `task`. El orquestador inyecta los bloques `<ProjectMemoryRules>` y `<ProjectTopology>` en el system prompt de tu agente desde el día cero —incluso sin reglas previas— para que no repita errores ya resueltos.

> El mismo motor se puede consultar a mano desde la terminal: `ancleto memory context --scope project`. El archivo `.ancleto/working-context.md` que lee el orquestador se regenera solo en `init`, `install --project` y `upgrade`.

**Dos memorias, sin mezcla.** La memoria **del repositorio** (esta, `.ancleto/memory.db`) guarda reglas y decisiones del proyecto y se comparte con el equipo. Si el runtime expone además una memoria **del agente** (por ejemplo engram, habilitable con `--with-engram`), esa guarda notas de sesión, no del repo. **Una entrada vive en una sola**: si un futuro agente del equipo debería encontrarla, va al repo.

---

## Comandos del ciclo SDD en tu IDE

Una vez instalado, tu IDE expone el ciclo de vida completo como comandos barra:

| Comando | Para qué sirve |
|---|---|
| `/cleto-new` | Iniciar la especificación de un feature. |
| `/cleto-propose` | Proponer el diseño técnico. |
| `/cleto-ff` | Avanzar rápido con el contexto ya recuperado. |
| `/cleto-apply` | Aplicar el código del change. |
| `/cleto-verify` | Verificar reglas, tests y memoria antes de cerrar. |
| `/cleto-sync` | Sincronizar las specs con el estado del repositorio. |
| `/cleto-archive` | Archivar el change y registrar aprendizajes. |
| `/cleto-continue` | Retomar un change con artefactos pendientes. |
| `/cleto-explore` | Explorar un problema sin comprometerse a implementar. |
| `/cleto-onboard` | Recorrer el ciclo completo en modo tutorial. |

---

## Azure DevOps (opcional)

Por defecto los comandos asumen **GitHub** (`ancleto-pr`). Si usás Azure DevOps:

```bash
ancleto init --with-azure
```

Esto escribe `azure.enabled: true` en tu `.ancletorc`. Después completá la sección de Azure en `PRODUCT.md` e instalá la extensión con `az extension add --name azure-devops`.

---

## Referencia: agentes y modelos por tier

Los 10 agentes instalados y el modelo que usa cada uno según tu tier. Al instalar, el nivel elegido se escribe en la línea `model:` de cada agente y se re-aplica en cada `update`.

| Agente | `normal` (default) | `minimo` | `gratis` |
|---|---|---|---|
| orchestrator | `opencode-go/qwen3.7-plus` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| coder | `opencode-go/minimax-m3` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| tester | `opencode-go/deepseek-v4.1-flash` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| spec-writer | `opencode-go/qwen3.7-plus` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| reviewer | `opencode-go/qwen3.6-plus` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| technical-discovery | `opencode-go/deepseek-v4.1-flash` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| technical-seed-writer | `opencode-go/minimax-m3` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| memory-keeper | `opencode-go/deepseek-v4.1-flash` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| context-resolver | `opencode-go/deepseek-v4.1-flash` | `opencode-go/deepseek-v4.1-flash` | ver nota |
| documenter | `opencode-go/deepseek-v4.1-flash` | `opencode-go/deepseek-v4.1-flash` | ver nota |

El tier `minimo` usa un único modelo para los 10 agentes: `deepseek-v4.1-flash` es el más económico del catálogo para coding (0.15 / 0.60 por millón de tokens) y ofrece 1M de contexto.

**Tier `gratis`.** Los 10 agentes usan **Muse Spark 1.3 Free** (`opencode/muse-spark-1.3-contributor-free`) si está disponible en tu cuenta —no está abierto a todos—. En una instalación interactiva el wizard te lo pregunta y la respuesta queda guardada en `.ancletorc` (`gratisModel`) para los siguientes `install`/`update`. Sin TTY se detecta con `opencode models` y, si no se puede confirmar, se usa `opencode/big-pickle`. El instalador siempre informa cuál aplicó.

> `ANCLETO_MUSE_SPARK=1` fuerza Muse Spark, `ANCLETO_MUSE_SPARK=0` fuerza `big-pickle`. Tiene prioridad sobre la elección guardada.
