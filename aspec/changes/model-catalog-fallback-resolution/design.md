# Design: model-catalog-fallback-resolution

## Contexto

El CLI resuelve el mapa de modelos de un tier en `src/core/tier-models.js` y lo aplica con
`applyTier` (`src/cli/index.js:586-595`). Hoy cada tier es un objeto plano agente→string, y el oráculo
de `check` (`src/cli/index.js:2903-2977`) reconstruye el estado esperado sustituyendo `model:` en la
fuente. El cambio conserva ese contrato y agrega tres piezas: un snapshot de catálogo, una cadena de
preferencia por agente y un resolver puro. La forma de `TIERS` no cambia para no romper `applyTier`,
el oráculo, los guards ni el spec vigente.

## Arquitectura

### Módulos y responsabilidades

| Módulo | Responsabilidad | Prohibiciones |
|---|---|---|
| `src/core/model-catalog.json` | Datos del catálogo verificado: `generated_at`, `method`, `providers`. | No se genera en tiempo de ejecución. |
| `src/core/model-catalog.js` | Cargar el snapshot, responder disponibilidad y validar IDs. | Sin red, sin procesos, sin estado global mutable. |
| `src/core/tier-models.js` | `TIERS`, `TIER_CHAINS`, resolver puro de tier, `gratis`. | Sin `node:child_process`; sin E/S. |
| `scripts/refresh-model-catalog.mjs` | Único punto que ejecuta `opencode models` y reescribe el snapshot. | Sólo manual; nunca en CI ni en `install`/`check`. |
| `src/cli/index.js` | Orquestación: resolver en `install`/`init`/`import`, oráculo de `check`, normalización de `.ancletorc`. | No reimplementa resolución ni validación de catálogo. |

El límite es deliberado: la resolución es pura y testeable; el único borde con efectos es el loader
(lectura de un JSON versionado) y el script de refresco (proceso externo).

El loader resuelve el catálogo en este orden: catálogo inyectado explícitamente, ruta alternativa
declarada en `ANCLETO_MODEL_CATALOG`, y snapshot commiteado. La ruta alternativa es un seam de
test/manual (mismo precedente que `ANCLETO_PROJECTS_FILE` y `ANCLETO_OPENCODE_DB`), no una
configuración de producto; sin la variable, el CLI usa siempre el snapshot versionado.

### Forma del snapshot

```json
{
  "generated_at": "2026-11-03",
  "method": "opencode models <provider> --verbose",
  "providers": {
    "opencode-go": ["opencode-go/qwen3.7-plus", "opencode-go/qwen3.8-max", "..."],
    "commandcode": ["commandcode/deepseek/deepseek-v4.1-flash", "..."],
    "opencode": ["opencode/big-pickle", "opencode/deepseek-v4.1-flash-free", "..."]
  }
}
```

Los IDs se guardan completos (proveedor incluido) para que la comparación con `model:` sea directa.
El snapshot no incluye metadatos de costo en esta iteración: el guard sólo verifica existencia. La
fortaleza del reviewer se sostiene en la decisión registrada, no en un cálculo del guard.

### Resolución por cadena

`TIER_CHAINS.tier[agente]` es una lista ordenada de IDs candidatos. `TIERS.tier[agente]` sigue siendo
un string y, para los tiers con cadena, es la cabeza de esa lista. El resolver:

1. Recibe `(tier, tiers, chains, catalog)`; es puro y no lee archivos ni procesos.
2. Para un tier sin cadena, devuelve el mapa de `TIERS` tal cual (comportamiento actual, incluido
   `gratis`).
3. Para un tier con cadena, recorre los candidatos de cada agente y elige el primero presente en el
   catálogo.
4. Devuelve un mapa agente→modelo y, además, el detalle por agente de candidatos y elegido, para que
   el oráculo pueda construir su conjunto de aceptación sin duplicar la lógica.
5. Si ningún candidato de un agente está disponible, lanza un error explícito que nombra el agente y
   la cadena completa. No existe fallback silencioso ni valor por defecto inventado.

Errores de resolución en `install`/`init`/`import` son fatales: el comando aborta con exit code no
cero antes de escribir agentes. En `check` no son fatales: el oráculo acepta los candidatos estáticos
y avisa que no hay candidato resoluble (ver abajo).

### Oráculo de `check`

Para cada agente de un directorio de agents instalado:

- `esperado` es la adaptación de la fuente que corresponde (canónica o overlay del perfil), sin tier.
- `resueltoAhora` es la adaptación con el modelo que el resolver elegiría hoy para ese agente.
- `aceptados` es el conjunto de adaptaciones con **todos** los candidatos estáticos de la cadena de
  ese agente (para tiers sin cadena, el único modelo del tier).

Un instalado igual a `esperado` o a cualquier elemento de `aceptados` no es divergencia. La
divergencia se reporta sólo si no coincide con ninguno.

El aviso de tier cuenta un agente cuando se cumple cualquiera de estas dos condiciones:

- el mirror difiere de `resueltoAhora` (el próximo `install`/`update` reescribiría `model:`), o
- `resueltoAhora` difiere de `esperado` (el tier configurado aplica un modelo distinto al de la
  fuente).

Con esa condición, ambas direcciones de la regresión quedan visibles:

| Escenario | Install | Check resuelve | Mirror vs `resueltoAhora` | `resueltoAhora` vs `esperado` | Resultado |
|---|---|---|---|---|---|
| Cabeza disponible en install, no en check | cabeza | segundo | difiere | difiere | sin divergencia, aviso |
| Cabeza no disponible en install, sí en check | segundo | cabeza | difiere | igual | sin divergencia, aviso |
| `minimo` estable | cabeza | cabeza | igual | igual | sin divergencia, sin aviso |
| `normal`/`gratis` con mirror canónico | canónica | tier | difiere | difiere | sin divergencia, aviso |

El aviso sigue siendo único por directorio; `<n>` es la cantidad de agentes en la condición. El exit
code no cambia por divergencia ni por aviso. Si el catálogo no tiene ningún candidato para un agente,
`resueltoAhora` no existe: no se cuenta como diferencia de tier y se emite un aviso separado, no
bloqueante, de catálogo no resoluble.

### `gratis` sin Muse Spark

`GRATIS_FALLBACK_MODEL` (`opencode/big-pickle`, costo 0) queda como único modelo gratis conocido.
Se eliminan `MUSE_SPARK_MODEL`, `detectMuseSpark`, la rama `ANCLETO_MUSE_SPARK` y la doble aceptación
del oráculo. `gratisModel(persisted)` devuelve el persistido sólo si es el modelo conocido; en caso
contrario devuelve el fallback. En `install`/`update`, un `.ancletorc.gratisModel` desconocido se
ignora y se reescribe con el gratis resuelto; un valor conocido se conserva; una clave ausente no se
agrega.

### Seam para CH-12

La interfaz que consume el CLI es el resolver puro sobre un catálogo inyectable. CH-12 puede
reemplazar el snapshot estático por una fuente agéntica (o por una combinación de snapshot y
selección) sin cambiar la firma que usan `install`/`init`/`import` ni el cálculo de aceptación del
oráculo. El snapshot queda como fallback determinista y auditable.

## Alternativas descartadas

- **`TIERS` con arrays por agente.** Rompe `applyTier`, el oráculo, dos guards y el spec vigente.
  Descartado a favor de un símbolo nuevo (`TIER_CHAINS`) y una cabeza string en `TIERS`.
- **Consultar el proveedor en cada `install`/`check`.** Introduce red, latencia y no determinismo en
  CI. Descartado a favor del snapshot commiteado y el script manual.
- **Persistir el modelo resuelto por agente.** `.opencode/.ancleto-tier` guarda sólo el tier y
  `upgrade` no aplica tier; persistir modelos agrega estado y migración. Descartado a favor del
  conjunto de aceptación completo.
- **Aceptar sólo `resueltoAhora`.** Falso `frontmatter diverge` cuando el catálogo cambia entre
  `install` y `check`.
- **Corregir el ID de Muse Spark.** Los `*-contributor` reales cuestan 0.1/0.2; `gratis` dejaría de
  ser free tier.

## Riesgos y bordes

- **Snapshot envejecido.** El guard detecta IDs inexistentes respecto del snapshot, no respecto del
  proveedor. El refresco manual y el `generated_at` hacen la deriva auditable.
- **`check` sin candidato.** No aborta; acepta los candidatos estáticos y avisa. Un `install` sin
  candidato sí aborta.
- **README y guards de contenido.** La tabla y la nota de `gratis` son texto con anclajes
  documentales; se ajustan sólo las líneas afectadas y se corre `test/content-guards.test.js`.
- **Overlay del perfil `test`.** `tester`/`reviewer` conservan la regla de propiedad por fase: tier en
  `install`/`update`, perfil en `upgrade`. El cambio sólo alinea el ID del reviewer del perfil.

## Estrategia de test

- **Catálogo:** guard de existencia para `TIERS`, `agents/*.md` y `profiles/*/agents/*.md`; escenario
  negativo con un ID removido en un catálogo de prueba; sin red.
- **Resolver:** cada nivel de la cadena, el error sin candidatos y la pureza (catálogo inyectado, sin
  E/S ni procesos).
- **CLI:** resolución en `install` con cabeza, sin cabeza y sin ningún candidato; normalización de
  `gratisModel`; regresión del oráculo en ambas direcciones; `check` sin candidato resoluble.
- **Guards existentes:** `test/agent-model-coherence.test.js`, `test/tier-models.test.js`,
  `test/cli.test.js`, `test/adapters-frontmatter.test.js` y `test/content-guards.test.js`.
- **Validación declarada:** `npm run lint` y `npm test` con el runner de `PRODUCT.md`; tests acotados
  con rutas explícitas, nunca `node --test` sin acotar. Format `not-configured`; typecheck no aplica.
