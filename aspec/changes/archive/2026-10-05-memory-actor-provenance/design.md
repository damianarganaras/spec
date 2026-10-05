# Design: Procedencia de escritura en el motor de memoria

## Approach

Se **extiende la semántica de la columna `source` existente** (`src/core/memory/database.js:15`),
sin agregar tabla ni columna. `source` pasa a ser, formalmente, el atributo de **procedencia**
del nodo: un valor resuelto **exclusivamente por el runtime desde contexto confiable**, con
vocabulario acotado a las superficies de escritura, e **inmune a la forja del caller** (los args
de las tools ya no tienen efecto sobre él; hoy ya es así de forma implícita, este change lo
formaliza y lo testea).

La procedencia es **auditoría, no autorización**: describe de qué superficie de escritura provino
un nodo, y NO se usa para autorizar ni denegar escrituras. El change NO implementa enforcement de
ownership porque la arquitectura actual (MCP stdio sin identidad de caller autenticada) no puede
sostenerlo; implementarlo sería prometer una propiedad inexistente.

## Architecture

Superficies de escritura confiables y su valor de procedencia:

```text
escritura                                  source (runtime-owned)
─────────────────────────────────────────  ────────────────────────────
tools MCP (recordRule/recordDecision)  ->  mcp:ancleto-memory
ancleto memory import                  ->  cli:import
toolkit programático sin source        ->  tool:recordRule | tool:recordDecision
engine.recordNode() directo (default)  ->  runtime
contexto de runtime que aporta un rol  ->  agent:<rol>   (si el runtime lo provee)
```

Resolución y frontera:

```text
caller (LLM) ──args──▶ tools MCP ──▶ handlers ──contexto de runtime confiable──▶ engine.recordNode
                         │                                                    │
                    source en args IGNORADO                        source = context.source || default
                                                                     │
                                                            INSERT memory_nodes.source
                                                                     │
                        publicNode() ────────────────▶ searchMemory (LLM): SIN source
                        listNodes() ─────────────────▶ ancleto memory list: CON source (auditoría)
```

Puntos de diseño:

- **Una sola fuente de verdad**: `recordNode` sigue siendo el único punto de inserción; la
  procedencia se resuelve ahí (`engine.js:196`), no en cada caller.
- **El import normaliza su valor**: `'import'` → `cli:import` para que la procedencia sea
  auto-descriptiva (import es una superficie distinta del runtime y del MCP).
- **La lectura de operador expone, la lectura del LLM no**: `listNodes` selecciona `n.source` y lo
  incluye en la respuesta; `publicNode` (base de `searchMemory`) permanece intacto. Esto preserva
  el invariante existente "no expone campos gestionados por el runtime" en la superficie que ve el
  LLM (`test/memory-engine.test.js:171-175`) y el encapsulamiento de los `inputSchema`
  (`test/memory-engine.test.js:367-373`).

## Decisión: auditoría vs enforcement

**Qué define a un "actor".** En esta arquitectura, el único actor registrable de forma confiable
es la **superficie de escritura del runtime** (MCP, import CLI, uso programático). El **rol del
LLM** (p. ej. memory-keeper vs coder) no es observable por el server MCP: las tools MCP llegan sin
identidad de caller, y los args son forjables. Registrar un actor auto-declarado por el caller
daría una identidad *no verificada* presentada como si lo fuera.

**Decisión:** este change registra y expone **procedencia (auditoría descriptiva)**, y
**excluye enforcement**. Un `source`/`actor` auto-declarado por el caller permanece ignorado (no
se persiste como identidad), igual que hoy con `id`/`status`/`confidence`.

### Alternativas de enforcement evaluadas (rechazadas/diferidas)

| Opción | Aporte | Por qué no ahora |
|---|---|---|
| Actor declarado por el caller en los args | Etiqueta "quién" | Forjable; rompe el encapsulamiento MCP; NO es enforceable |
| Identidad del host al spawn del server MCP (env/args) | Etiqueta de sesión | No autenticada y no por-rol; no hay plumbing hoy; daría falsa confianza |
| Canal de identidad autenticado por tool/llamada (token por agente) | Enforcement real | Cambio arquitectónico mayor; fuera de scope; candidato a change futuro |

**Resultado**: procedencia hoy; enforcement diferido a un change con canal de identidad
autenticado. El diseño deja el dato en el lugar correcto (`source`) para que ese enforcement
futuro tenga una base observable, sin construir hoy extensiones especulativas.

## Trade-offs

| Decisión | Alternativa | Por qué esta |
|---|---|---|
| Extender `source`, no crear columna `actor` | `ALTER TABLE ... ADD COLUMN actor` | La columna ya existe y es runtime-owned; el backlog pide extender `source`, no crear estructura nueva |
| Provenance = superficie de escritura | Identidad de rol del LLM | El rol no es autenticable en MCP stdio; registrarlo sería insostenible |
| Exponer en `listNodes`, no en `searchMemory` | Incluir `source` en el read model del LLM | Respeta el invariante "no expone campos del runtime" y el encapsulamiento de firmas MCP |
| Normalizar import a `cli:import` | Dejar `'import'` | Vocabulario namespaced y consistente con `mcp:ancleto-memory`; sin contrato que lo fije |
| Auditoría ahora, enforcement diferido | Enforcement con actor auto-declarado | Separa lo descriptivo de lo verificable; no promete propiedad inexistente |

## Validation

- Tests de motor en `test/memory-engine.test.js`:
  - `recordNode` ignora un `source` forjado y usa el del runtime (ya cubierto en `:351-359`, se
    extiende a la procedencia por superficie).
  - `listNodes` incluye `source`; `searchMemory` NO lo incluye (preserva `:171-175`).
  - Las firmas MCP siguen sin exponer `source` (`:367-373`).
- Tests de integración en `test/mcp.test.js`:
  - Un nodo escrito por MCP persiste `source = 'mcp:ancleto-memory'` y aparece en
    `memory list --json`.
  - Un `source` forjado en los args de la tool no altera la procedencia persistida.
- Gates del repo: `npm run typecheck`, `npm run lint`, `npm test` (acotar con rutas explícitas
  por la regla `node-test-scope-explicit-paths`).
- No hay migración de schema: los nodos existentes conservan su `source` previo (datos
  históricos, posiblemente `mcp:ancleto-memory`); el vocabulario aplica a escrituras nuevas.
