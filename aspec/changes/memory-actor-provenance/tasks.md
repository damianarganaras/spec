# Tasks: Procedencia de escritura en el motor de memoria (actor/provenance)

## Implementación

- [ ] **T1**: Formalizar la procedencia en `src/core/memory/engine.js`
  - Dejar explícito que `recordNode` resuelve `source` solo desde `context.source || 'runtime'`
    (comentario de contrato; sin cambio de firma).
  - Asegurar que un `source` presente en `input` (args del caller) sigue siendo ignorado.
  - Documentar en el código el vocabulario de procedencia y la frontera auditoría/enforcement.

- [ ] **T2**: Normalizar la procedencia de la superficie de import en `src/core/memory/engine.js`
  - Reemplazar los literales `'import'` por `'cli:import'` en `importNodes` (inserción y upsert).
  - No cambiar la firma ni el resumen (`{inserted, updated, skipped}`).

- [ ] **T3**: Exponer la procedencia en la lectura de operador (`src/core/memory/engine.js`)
  - `listNodes` SHALL seleccionar `n.source` e incluirlo en cada nodo devuelto.
  - NO tocar `publicNode`: `searchMemory` debe seguir sin exponer campos del runtime.

- [ ] **T4**: Confirmar el cableado del valor MCP en `src/core/memory/mcp-server.js`
  - Mantener `source: 'mcp:ancleto-memory'` como procedencia de la superficie MCP.
  - Verificar que `createMemoryToolHandlers` no permite override por args (encapsulamiento).

- [ ] **T5**: Confirmar que `ancleto memory list --json` (`src/cli/index.js`) refleja `source`
  - Sin cambio de comando: el JSON de `listNodes` ya debe traer `source`.
  - Opcional (no bloqueante): agregar `source` al formato de texto de `memory list`.

- [ ] **T6**: Extender `DESIGN-memory-engine-v0.2.0.md` (sin reescribirlo)
  - En §2.1/§3: definir `source` como procedencia runtime-owned, su vocabulario y la frontera
    auditoría vs enforcement.

## Testing

- [ ] **T7**: Tests de motor en `test/memory-engine.test.js`
  - `recordNode`: un `source` forjado en `input` no tiene efecto; gana el del runtime (extender `:351-359`).
  - `listNodes`: cada nodo devuelto incluye `source`.
  - `searchMemory`: el resultado NO incluye `source` (preserva `:171-175`).
  - Firmas MCP: `inputSchema` siguen sin `source` (preserva `:367-373`).

- [ ] **T8**: Tests de import en `test/memory-engine.test.js`
  - Un nodo importado persiste `source = 'cli:import'`.

- [ ] **T9**: Tests de integración en `test/mcp.test.js`
  - Una regla escrita vía tool MCP persiste `source = 'mcp:ancleto-memory'`.
  - Ese `source` aparece en `ancleto memory list --json`.
  - Un `source` forjado en los args de la tool no altera la procedencia persistida.

## Validación

- [ ] **T10**: Correr `npm run typecheck`, `npm run lint` y `npm test` acotado con rutas
  explícitas (`node --test test/memory-engine.test.js test/mcp.test.js`) y verificar todo en verde.
