# Design: collector único de declaraciones versionadas

## Contexto

Hoy el repositorio lee las mismas fuentes de IDs de modelo en dos consumidores que deben coincidir:

| Consumidor | Fuente actual | Semántica de error |
|---|---|---|
| Guard de tests (`test/model-catalog.test.js`) | `agentModelEntries()` lee `agents/*.md` y `profiles/*/agents/*.md` | fail-closed |
| Gate de `--write` (`scripts/refresh-model-catalog.mjs`) | `readAgentModels()` lee las mismas fuentes | fail-closed con contexto |

Agregar `opencode.json` → `agent.<nombre>.model` en cada consumidor por separado obligaría a repetir
el parseo del JSON, la validación de `agent` y la etiqueta de origen en dos lugares. El riesgo no es
sólo duplicación: si el test y `--write` no leen exactamente el mismo conjunto, `--write` puede
escribir un snapshot que el guard rechaza después.

El aviso advisory de `check` conserva su collector y sus cuatro fuentes actuales; no se toca en este
change.

## Decisión

Centralizar la lectura en un único collector síncrono y fail-closed:

`readModelDeclarations({ rootDir })` → `[{ id, source }]`

- Fuentes: `agents/*.md`, `profiles/*/agents/*.md` y `opencode.json`.
- Origen: `agents/<archivo>`, `profiles/<perfil>/agents/<archivo>` y
  `opencode.json#agent.<nombre>.model`.
- Una fuente requerida ilegible o un `opencode.json` con JSON inválido produce un error con la fuente
  nombrada.
- Sin red, sin `node:child_process`, sin `.opencode/**` ni `.ancletorc`.

El collector vive en `src/core/model-declarations.js`. El cálculo y la deduplicación siguen en
`declaredModelIds` (`src/core/tier-models.js`), que conserva su contrato puro: recibe las entradas ya
leídas y no toca el sistema de archivos.

## Alternativas descartadas

1. **Dos collectors independientes.** Es la opción de menor diff inicial, pero deja dos parseos de
   `opencode.json` y permite que el test y `--write` deriven conjuntos distintos. Descartada.
2. **Poner la lectura de archivos en `declaredModelIds`.** Rompe el contrato puro del helper y obliga
   a los tests unitarios a usar fixtures de disco para probar la deduplicación. Descartada.
3. **Leer `opencode.json` sólo desde el test.** Cierra el guard pero no el gate de `--write`, que es
   justamente el punto donde un snapshot inválido se escribe antes de que el test lo vea. Descartada.
4. **Leer `.opencode/**` o `.ancletorc`.** Son mirrors/estado local, no fuentes versionadas; el guard
   debe ser determinista en CI. Descartada.

## Flujo

```
opencode.json ─┐
agents/*.md ───┼─> readModelDeclarations({ rootDir }) ─> [{ id, source }]
profiles/* ────┘
                                      │
                                      ├─> declaredModelIds({ agentModels }) ─> Map id→origen
                                      │
                                      └─> missingModelIdsInCatalog(snapshot, declaraciones)
```

- Guard de tests: compara contra el snapshot commiteado.
- `--write`: pre-valida contra el snapshot candidato antes de escribir.

## Deduplicación y cobertura de `opencode.json`

`declaredModelIds` conserva el primer origen de cada ID. Hoy las diez entradas de `opencode.json`
declaran el mismo ID que ya aparece en `TIERS.minimo`, por lo que un conjunto combinado nunca
mostraría `opencode.json` como origen.

Por eso el guard evalúa `opencode.json` en un grupo propio:

```
opencodeIds = declaredModelIds({ tiers: {}, chains: {}, agentModels: opencodeEntries })
```

Así un ID ausente del snapshot se reporta con `opencode.json#agent.<nombre>.model` aunque también lo
declare otra fuente. El conjunto combinado sigue existiendo para cubrir IDs únicos que sólo aparezcan
en `opencode.json`, y el guard exige que el archivo aporte al menos una declaración para que la
cobertura no sea vacía.

## Modo de error

**Fail-closed (guard y `--write`).** `opencode.json` ausente, ilegible o con JSON inválido es un fallo
del repositorio, no una ausencia legítima. El mensaje nombra la fuente y no se escribe nada.

## Impacto

- No cambia `TIERS`, `TIER_CHAINS`, `resolveTierModels` ni `src/core/model-catalog.json`.
- No cambia los valores de `opencode.json` ni `package.json` → `files`.
- No cambia el aviso advisory de `check` ni sus cuatro fuentes.
- No agrega dependencias de runtime ni acceso a red.
