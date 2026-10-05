# Tasks: Procedencia de escritura en el motor de memoria (actor/provenance)

## Implementación

- [x] **T1**: Formalizar la procedencia en `src/core/memory/engine.js`
  - Dejar explícito que `recordNode` resuelve `source` solo desde `context.source || 'runtime'`
    (comentario de contrato; sin cambio de firma).
  - Asegurar que un `source` presente en `input` (args del caller) sigue siendo ignorado.
  - Documentar en el código el vocabulario de procedencia y la frontera auditoría/enforcement.

- [x] **T2**: Normalizar la procedencia de la superficie de import en `src/core/memory/engine.js`
  - Reemplazar los literales `'import'` por `'cli:import'` en `importNodes` (inserción y upsert).
  - No cambiar la firma ni el resumen (`{inserted, updated, skipped}`).

- [x] **T3**: Exponer la procedencia en la lectura de operador (`src/core/memory/engine.js`)
  - `listNodes` SHALL seleccionar `n.source` e incluirlo en cada nodo devuelto.
  - NO tocar `publicNode`: `searchMemory` debe seguir sin exponer campos del runtime.

- [x] **T4**: Confirmar el cableado del valor MCP en `src/core/memory/mcp-server.js`
  - Mantener `source: 'mcp:ancleto-memory'` como procedencia de la superficie MCP.
  - Verificar que `createMemoryToolHandlers` no permite override por args (encapsulamiento).

- [x] **T5**: Confirmar que `ancleto memory list --json` (`src/cli/index.js`) refleja `source`
  - Sin cambio de comando: el JSON de `listNodes` ya debe traer `source`.
  - Opcional (no bloqueante): agregar `source` al formato de texto de `memory list`.

- [x] **T6**: Extender `DESIGN-memory-engine-v0.2.0.md` (sin reescribirlo)
  - En §2.1/§3: definir `source` como procedencia runtime-owned, su vocabulario y la frontera
    auditoría vs enforcement.

## Testing

- [x] **T7**: Tests de motor en `test/memory-engine.test.js`
  - `recordNode`: un `source` forjado en `input` no tiene efecto; gana el del runtime (extender `:351-359`).
  - `listNodes`: cada nodo devuelto incluye `source`.
  - `searchMemory`: el resultado NO incluye `source` (preserva `:171-175`).
  - Firmas MCP: `inputSchema` siguen sin `source` (preserva `:367-373`).
  - **Evidencia:** `recordNode` forjado→`runtime`; `listNodes` con `source` por nodo (`agent:tester`/`runtime`);
    `searchMemory` sin `source`; retrocompat de `source` histórico `'import'`; `inputSchema` sin `source`.

- [x] **T8**: Tests de import en `test/memory-engine.test.js`
  - Un nodo importado persiste `source = 'cli:import'`.
  - **Evidencia:** `source = 'cli:import'` verificado en el insert, en el upsert y en el nodo superseded.

- [x] **T9**: Tests de integración en `test/mcp.test.js`
  - Una regla escrita vía tool MCP persiste `source = 'mcp:ancleto-memory'`.
  - Ese `source` aparece en `ancleto memory list --json`.
  - Un `source` forjado en los args de la tool no altera la procedencia persistida.
  - **Evidencia:** round-trip MCP→`memory list --json` con `source = 'mcp:ancleto-memory'`;
    arg `source: 'agent:hacker'` ignorado; `tools/list` serializado sin `source`.

## Validación

- [x] **T10**: Correr `npm run typecheck`, `npm run lint` y `npm test` acotado con rutas
  explícitas (`node --test test/memory-engine.test.js test/mcp.test.js`) y verificar todo en verde.
  - **Evidencia:** `node --test test/memory-engine.test.js` (63/63), `test/mcp.test.js` (14/14),
    `test/cli.test.js` (184/184), `test/content-guards.test.js` (45/45),
    `test/adapters-frontmatter.test.js` (43/43) y `npm run lint` en verde.
  - **Evidencia (gate de ruta modificada):** `node --test test/working-context.test.js` (21/21,
    0 fail) — ejercita `createMemoryToolkit`/`createMemoryToolHandlers`/`listNodes`; cambio aditivo,
    sin ajustes al test.
  - `npm run typecheck`: **N/A** (repo JS puro sin `tsconfig` ni script `typecheck`).
