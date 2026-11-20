---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-20T19:51:44.420Z
pluginVersion: 0.42.0
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
| Versión en el árbol | `0.42.0` (rama `development`, HEAD `9e33868`; bump en `c316cf4`) | `package.json`, git log |
| Estado de 0.42.0 | **Preparada**: change implementado y archivado; **sin tag ni run de publish todavía** | `aspec/backlog.md` |
| Última publicada | `0.41.0` — tag `v0.41.0` sobre `5c171bc`, run `44781865327` exitoso y `latest` en npm | `aspec/backlog.md`, `.github/workflows/publish.yml` |
| Novedad de 0.42.0 | Presupuesto del working-context **configurable**: default 4000 tokens (16.000 chars), env `ANCLETO_WORKING_CONTEXT_TOKENS`, `.ancletorc` → `memory.maxTokens`, `0`/`"unlimited"` sin tope | `src/core/memory/working-context.js`, `src/core/memory/engine.js` |
| Changes archivados relevantes | `memory-working-context-budget` y `memory-recall-bm25-first` en `aspec/changes/archive/2026-11-20-*/` | `aspec/changes/archive/**` |
| Runtime | Node.js ≥ 24, ESM, sin dependencias de runtime | `package.json` |
| Entrada | `src/cli/index.js` (bins `ancleto` y `aspec`) | `package.json` |
| Persistencia propia | SQLite nativo (`node:sqlite`) + FTS5 en `.ancleto/memory.db` | `src/core/memory/**` |
| Seed técnico | `docs/technical-discovery/` (este árbol) | `.discovery-map.json` |
| Tamaño del mapa | 971 archivos; `aspec` 380, `documentation` 340, `.opencode` 66, `test` 40, `docs` 22, `src` 25, `skills` 35 | `.discovery-map.json` |

## Elegí un destino

| Si la pregunta es sobre… | Leé | Por qué |
| --- | --- | --- |
| Qué es el producto, cómo está armado y cuáles son los flujos principales | `overview.md` | Arquitectura, componentes y journeys |
| Cómo correr, testear o preparar el entorno | `setup.md` | Comandos declarados, variables y artefactos |
| Reglas, invariantes, riesgos, deuda o acoplamiento | `decisions.md` | Restricciones que condicionan cambios |
| Sistemas externos y dependencias privadas observables | `integrations.md` | Repomix, opencode, jev-spec, git, npm, hosts |
| Qué unidades existen y dónde entra cada una | `units/_map.md` | Tabla compacta de unidades |
| Instalación, actualización, hosts, MCP, tiers y diagnósticos | `units/cli-install.md` | Dossier de alto impacto |
| Discovery, pack Repomix, impacto del seed, affected-set y tests | `units/discovery-engine.md` | Dossier de alto impacto |
| Memoria persistente, recall BM25-first, presupuesto del working-context, tools MCP y operaciones | `units/memory-engine.md` | Dossier de alto impacto |
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
`node src/cli/index.js ...`: el binario global puede estar rezagado (el `.ancleto/machine-env.md`
local declara `0.40.0`, anterior a `0.42.0`). La topología vive en `.discovery-map.json`; el estado
de frescura en `docs/technical-discovery/.discovery-state.json`; `seed-map.json` acota la próxima
regeneración. Esta generación parte de `9e33868` (backlog que relaciona el change con 0.42.0) y
estampa la versión `0.42.0` en los once documentos del seed.
