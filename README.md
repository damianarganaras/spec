<div align="center">

# ☕ ANCLETO (aspec)
**Orquestador SDD (Spec-Driven Development) y Toolkit Personal Asistido por IA**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2024.0.0-43853D?style=flat-square&logo=node.js&logoColor=white)](#requisitos)
[![Version](https://img.shields.io/badge/version-v0.6.2-blue?style=flat-square)](#uso-rápido)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen?style=flat-square)](#requisitos)

*Descubrimiento técnico, memoria persistente y control estricto de tokens para tu IDE.*

</div>

---

## 📖 Tabla de Contenidos

- [¿Qué es Ancleto?](#-qué-es-ancleto)
- [¿Por qué fue creado?](#-por-qué-fue-creado)
- [Características Principales](#-características-principales)
- [Requisitos](#-requisitos)
- [Instalación](#-instalación)
- [Configuración y Tiers de Costo](#-configuración-y-tiers-de-costo)
- [Uso Rápido](#-uso-rápido)
- [Referencia de Comandos CLI](#-referencia-de-comandos-cli)
- [Motor de Memoria Persistente](#-motor-de-memoria-persistente)
- [Comandos del Ciclo SDD en tu IDE](#-comandos-del-ciclo-sdd-en-tu-ide)
- [Azure DevOps (Opcional)](#-azure-devops-opcional)

---

## 🚀 ¿Qué es Ancleto?

**Ancleto** (cuyo alias de CLI es `aspec`) es un orquestador ligero diseñado para potenciar el desarrollo de software asistido por Inteligencia Artificial bajo el paradigma **SDD (Spec-Driven Development)**.

Funciona como un conjunto de herramientas y agentes que viven en tu entorno de desarrollo local (como OpenCode, Cursor, VS Code, Roo, etc.), permitiéndote automatizar la escritura de especificaciones, el descubrimiento topológico del código y la retención de memoria de las decisiones técnicas.

Todo esto está envuelto en una CLI moderna, interactiva y construida bajo una filosofía estricta de **cero dependencias (Zero-Deps)**.

## 💡 ¿Por qué fue creado?

Al trabajar en repositorios complejos con asistentes de IA, surgen tres problemas críticos:

1. **La "Memoria de Pez" de los LLMs:** Los agentes olvidan las convenciones del proyecto o las decisiones arquitectónicas pasadas en cuanto se limpia la ventana de contexto.
2. **El Costo Oculto (Token Budgeting):** Empaquetar todo un monorepo para darle contexto a la IA consume presupuestos de tokens masivos y encarece el uso de las APIs.
3. **Falta de Estandarización:** Cada agente de IA actúa por su cuenta, sin seguir un ciclo de vida definido de especificación -> revisión -> implementación -> verificación.

**Ancleto** nace para resolver esto. Centraliza las reglas de negocio en un motor de memoria local (`node:sqlite`), empaqueta inteligentemente el contexto según el nivel de tu suscripción (Tiers) y orquesta 10 subagentes nativos para que el código que escriba la IA cumpla estrictamente con tus estándares, minimizando la fricción y los costos.

---

## ✨ Características Principales

- 🤖 **Catálogo Multi-Agente (10 Agents):** Orquestador, Coder, Tester, Spec-Writer, Reviewer, Documenter, Technical-Discovery, Technical-Seed-Writer, Memory-Keeper y Context-Resolver.
- 🧠 **Motor de Memoria Persistente (FTS5):** Base local SQLite (`.ancleto/memory.db`) que provee al LLM herramientas para registrar y recuperar reglas arquitectónicas y decisiones pasadas proactivamente.
- 🗺️ **Discovery Engine:** Un escáner topológico rápido que genera mapas del repositorio (`.discovery-map.json`) y empaqueta el contexto vía Repomix con presupuestos de tokens dinámicos.
- 💸 **Gestión de Tiers de Costo:** Control absoluto sobre qué modelos y cuánto contexto se envía (`normal`, `minimo`, `gratis`), protegiendo tus cuotas de API.
- ⚡ **Agentic OpenSpec Engine:** Totalmente independiente, sin binarios externos. Las 11 skills del ciclo de vida (`new`, `propose`, `apply`, `verify`, `archive`, `bulk-archive`, `continue`, `explore`, `ff`, `onboard`, `workflow`) se instalan e inyectan nativamente en tu IDE favorito, más skills auxiliares (`ancleto-commit`, `ancleto-pr`, `triage-clarifier`, entre otras).
- 🎨 **Wizard Interactivo:** Inicialización por TTY con banner animado y menús navegables con flechas, sin requerir librerías pesadas (Zero-Deps).

---

## 🛠 Requisitos

Dado que Ancleto mantiene una política de cero dependencias externas, aprovecha las capacidades nativas más recientes de Node:

- **Node.js >= 24.0.0** (requerido estrictamente para el módulo nativo `node:sqlite`).
- **Repomix** (utilizado dinámicamente vía `npx` si no está instalado globalmente, para el empaquetado de contexto).

---

## 📦 Instalación

Puedes instalar la herramienta a nivel global o por proyecto.

```bash
# Instalación global (disponible en todos tus proyectos)
npm install -g @ancleto/spec

# O alternativamente a través de la CLI de ancleto:
ancleto install

# Instalación circunscrita a un proyecto específico (inyecta templates y .opencode/)
ancleto install --project /ruta/repo

# Instalación sin modificar la configuración MCP de tu IDE
ancleto install --no-mcp

# Actualizar a la última versión manteniendo tus personalizaciones
ancleto update
```

*(El instalador configura por defecto los MCP locales **engram** y **caveman**. Si un binario no se encuentra en tu sistema, se omitirá con un warning sin romper el flujo).*

---

## ⚙️ Configuración y Tiers de Costo

Al ejecutar la CLI por primera vez, un **Wizard interactivo (ASCII animado)** te guiará para configurar el Agente (IDE) y tu nivel de gasto. También puedes pasarlos por flags:

```bash
ancleto init --agent opencode --tier normal
```

**Tiers Disponibles:**

* `normal`: Modelos balanceados sin restricciones agresivas de contexto (default).
* `minimo`: Enfoque en el modelo pago más económico viable, con alta compresión de contexto y exclusión de tests/docs en el discovery.
* `gratis`: Bloqueado a modelos gratuitos (ej. `opencode/big-pickle`), empaquetado ultra-agresivo y un límite estricto (budget) de tokens enviado al LLM.

La configuración se preserva en `.ancletorc` (raíz del proyecto) y `.ancleto-tier` (junto a la configuración instalada).

---

## 💻 Uso Rápido

El ciclo diario con Ancleto consiste en preparar el terreno técnico para tu Agente y luego usar los comandos del ciclo SDD dentro de tu IDE.

### 1. Inicialización en un Repositorio

```bash
cd tu-proyecto
ancleto init              # Crea .ancletorc, plantillas AGENTS.md y PRODUCT.md
```

### 2. Descubrimiento Técnico de Contexto

```bash
ancleto discovery --check # Verifica si el 'technical seed' requiere actualización (READY/STALE)
ancleto discovery         # Genera .discovery-map.json y empaqueta el repo
```

### 3. Integración Diaria

Utiliza los comandos barra (`/`) expuestos en el chat de tu IDE (ej. Cursor, OpenCode):

* `/opsx-new` y `/opsx-propose`: Para planificar un nuevo feature.
* `/opsx-verify` y `/opsx-apply`: Para validar reglas, chequear tests y aplicar el código.
* `/opsx-archive`: Para consolidar el historial y registrar aprendizajes en la memoria de Ancleto.

---

## 📟 Referencia de Comandos CLI

Todos los comandos de mantenimiento que puedes necesitar en el día a día:

```bash
ancleto init [--agent <nombre>] [--tier <nivel>] [--with-azure]
                          # Configura el proyecto (interactivo en TTY)

ancleto install [--project <dir>] [--tier <nivel>] [--agent <nombre>] [--no-mcp]
                          # Instala agents, skills y templates

ancleto update            # Re-instala la última versión sobre lo existente

ancleto upgrade           # Re-aplica templates y skills respetando tus personalizaciones

ancleto check             # Verifica la integridad de la instalación (0 faltantes, 0 huérfanos)

ancleto doctor            # Diagnostica el entorno (Node, node:sqlite, opencode.json)

ancleto memory context [--scope <project|feature|task>] [--out <archivo>]
                          # Muestra el bloque de memoria activa del proyecto

ancleto memory doctor [--rebuild]
                          # Diagnostica la base de memoria (y reconstruye el índice con --rebuild)

ancleto discovery [--compress] [--include <glob>] [--ignore <glob>] [--token-budget <n>]
                          # Empaqueta el repo con Repomix según tu tier
```

---

## 🧠 Motor de Memoria Persistente

Ancleto **no** usa bases de datos vectoriales pesadas. Implementa una solución elegante en **SQLite nativo** con búsqueda full-text (FTS5) y BM25.

El LLM tiene a su disposición 3 herramientas (tools):

* `searchMemory`: Recupera contexto de decisiones previas.
* `recordRule`: Guarda una regla arquitectónica estricta de manera jerárquica (Proyecto > Feature > Tarea).
* `recordDecision`: Inmortaliza el "por qué" de un cambio en el código.

El orquestador inyecta proactivamente los bloques `<ProjectMemoryRules>` y `<ProjectTopology>` (contexto desde el día cero, incluso sin reglas previas) en el System Prompt de tu Agente para que **nunca repita los mismos errores**.

---

## 🔄 Comandos del Ciclo SDD en tu IDE

Una vez instalado, tu IDE expone el ciclo de vida completo como comandos barra (`/`):

| Comando | Para qué sirve |
|---|---|
| `/opsx-new` | Iniciar la especificación de un feature |
| `/opsx-propose` | Proponer el diseño técnico |
| `/opsx-ff` | Avanzar rápido con contexto recuperado |
| `/opsx-apply` | Aplicar el código del change |
| `/opsx-verify` | Verificar reglas, tests y memoria antes de cerrar |
| `/opsx-sync` | Sincronizar specs con el estado del repo |
| `/opsx-archive` | Archivar el change y registrar aprendizajes |
| `/opsx-continue`, `/opsx-explore`, `/opsx-onboard` | Retomar, explorar y orientarse en el proyecto |

---

## 🔗 Azure DevOps (Opcional)

Por defecto, los comandos asumen el uso de **GitHub** (`ancleto-pr`). Si tu equipo utiliza Azure DevOps:

```bash
ancleto init --with-azure
```

Esto escribe `azure.enabled: true` en tu `.ancletorc`. Solo deberás completar la sección de Azure en el archivo `PRODUCT.md` e instalar su extensión (`az extension add --name azure-devops`).
