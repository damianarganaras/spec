---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (paquete npm de la CLI `ancleto`, alias
`aspec`). No es un inventario: es el contexto mínimo para responder preguntas técnicas sin
recorrer todo el repositorio.

## Identidad rápida

| Dato | Valor | Evidencia |
| --- | --- | --- |
| Producto | Orquestador SDD liviano con subagentes optimizados para costo/tokens | `package.json` |
| Versión en el árbol | `0.43.1` (rama `development`, HEAD `c58a01b`; bump en `7758d46`) | `package.json`, git log |
| Estado de 0.43.1 | **Preparada, sin push**: `package.json` y `CHANGELOG.md` en `0.43.1`; tag anotado local `v0.43.1` (objeto `fce834b`) → `7758d46`; sin run de publicación registrado | `package.json`, `CHANGELOG.md`, `aspec/backlog.md`, `git cat-file -p v0.43.1` |
| Última publicada | `0.43.0` — tag `v0.43.0` → `9a7220c`, run `44827344442` `success` y `latest` en npm; antes `0.42.0` (tag `v0.42.0` → `c6319c8`, run `44808502480`) | `aspec/backlog.md`, `.github/workflows/publish.yml` |
| Novedad de 0.43.1 | CH-10: matriz **offline** de 8 hosts × `init`/`install`/`update`/`upgrade`/`import --repair` sin bundle, más el requirement `Matriz de hosts y operaciones de ciclo de vida` en `agent-install-routing`; **sin cambios de runtime** | `CHANGELOG.md`, `test/host-matrix.test.js`, `aspec/specs/agent-install-routing/spec.md` |
| Novedad de 0.43.0 | `memory import` rechaza `scope` no-string o vacío (`entry[i].scope invalido`) en el validador compartido por `importNodes` y `classifyImport`; paridad dry-run/write y pre-check del CLI | `CHANGELOG.md`, `src/core/memory/engine.js`, `src/cli/index.js` |
| Novedad de 0.42.0 | Presupuesto del working-context **configurable**: default 4000 tokens (16.000 chars), env `ANCLETO_WORKING_CONTEXT_TOKENS`, `.ancletorc` → `memory.maxTokens`, `0`/`"unlimited"` sin tope | `src/core/memory/working-context.js`, `src/core/memory/engine.js` |
| Changes archivados relevantes | `ch-10-host-matrix-hardening`, `ch-00-baseline`, `ch-07-trigger-workload-metricas-host`, `memory-import-scope-string`, `memory-working-context-budget`, `memory-recall-bm25-first` | `aspec/changes/archive/2026-11-2*/` |
| Runtime | Node.js ≥ 24, ESM, sin dependencias de runtime | `package.json` |
| Entrada | `src/cli/index.js` (bins `ancleto` y `aspec`) | `package.json` |
| Persistencia propia | SQLite nativo (`node:sqlite`) + FTS5 en `.ancleto/memory.db` | `src/core/memory/**` |
| Seed técnico | `docs/technical-discovery/` (este árbol) | `.discovery-map.json` |
| Tamaño del mapa | 984 archivos; `aspec` 391, `documentation` 340, `.opencode` 66, `test` 41, `docs` 23, `src` 25, `skills` 35 | `.discovery-map.json` |

## Elegí un destino

| Si la pregunta es sobre… | Leé | Por qué |
| --- | --- | --- |
| Qué es el producto, cómo está armado y cuáles son los flujos principales | `overview.md` | Arquitectura, componentes y journeys |
| Cómo correr, testear o preparar el entorno | `setup.md` | Comandos declarados, variables y artefactos |
| Reglas, invariantes, riesgos, deuda o acoplamiento | `decisions.md` | Restricciones que condicionan cambios |
| Sistemas externos y dependencias privadas observables | `integrations.md` | Repomix, opencode, jev-spec, git, npm, hosts |
| Qué unidades existen y dónde entra cada una | `units/_map.md` | Tabla compacta de unidades |
| Instalación, actualización, hosts, MCP, tiers, diagnósticos y matriz de hosts | `units/cli-install.md` | Dossier de alto impacto |
| Discovery, pack Repomix, impacto del seed, affected-set y tests | `units/discovery-engine.md` | Dossier de alto impacto |
| Memoria persistente, recall BM25-first, presupuesto del working-context, validación de import, tools MCP y operaciones | `units/memory-engine.md` | Dossier de alto impacto |
| Qué no se pudo verificar en esta generación | `unknowns.md` | Límites de evidencia |
| Qué cubre el seed | `inventory.md` | Alcance documentado |

## Regla de lectura

1. Abrí este índice.
2. Elegí **un** destino de la tabla.
3. Abrí como máximo un dossier enlazado.
4. Para confirmar un detalle reciente, leé solo el archivo fuente citado por el documento.

## Frescura

El seed se genera desde un único pack Repomix y se valida con
`node src/cli/index.js discovery --check`. Toda corrida de CLI en este repositorio debe usar
`node src/cli/index.js ...`: el binario global puede estar rezagado. La topología vive en
`.discovery-map.json`; el estado de frescura en `docs/technical-discovery/.discovery-state.json`;
`seed-map.json` acota la próxima regeneración. Esta generación parte de `c58a01b`
(`docs(backlog): evaluar CH-09c/CH-09d sin disparador`), con el seed previo `STALE/minor` por las
áreas `.ancletorc`, `CHANGELOG.md`, `aspec`, `docs` y `test`, y estampa `0.43.1` en los once
documentos.
