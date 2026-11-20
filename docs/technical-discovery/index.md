---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-20T01:12:16.920Z
pluginVersion: 0.40.1
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
| Versión de release | `0.40.1` | `package.json`, `CHANGELOG.md` |
| Runtime | Node.js ≥ 24, ESM, sin dependencias de runtime | `package.json` |
| Entrada | `src/cli/index.js` (bins `ancleto` y `aspec`) | `package.json` |
| Persistencia propia | SQLite nativo (`node:sqlite`) + FTS5 en `.ancleto/memory.db` | `src/core/memory/**` |
| Seed técnico | `docs/technical-discovery/` (este árbol) | `.discovery-map.json` |

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
| Memoria persistente, tools MCP, refs, working-context y operaciones | `units/memory-engine.md` | Dossier de alto impacto |
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
`node src/cli/index.js ...`: el binario global puede estar rezagado. El estado vive en
`.discovery-map.json` y `docs/technical-discovery/.discovery-state.json`.
