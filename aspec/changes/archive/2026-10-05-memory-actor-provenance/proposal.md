# Proposal: Procedencia de escritura en el motor de memoria (actor/provenance)

## Problem

El motor de memoria (`.ancleto/memory.db`, `node:sqlite` + FTS5) registra una columna `source`
en cada nodo (`src/core/memory/database.js:15`), pero esa columna NO distingue quién ni qué
escribió:

- El server MCP fija `source: 'mcp:ancleto-memory'` para **todos** los nodos
  (`src/core/memory/mcp-server.js:16`), sin importar la tool ni la sesión.
- `recordNode` resuelve `source` del contexto de runtime, no de una identidad de emisor
  (`src/core/memory/engine.js:196`).
- El import del CLI persiste un literal `'import'` (`src/core/memory/engine.js:297,313`).
- `source` nunca se expone en la lectura de operador (`listNodes`), así que no es auditable.
- El diseño congelado declara `source` "gestionado por el runtime" pero no define su vocabulario
  ni su semántica (`DESIGN-memory-engine-v0.2.0.md:30,52`).

Consecuencia (ítem **B5** del backlog): el ownership de escritura es una convención del workflow,
no una propiedad observable ni enforceable. No hay forma de auditar de qué superficie de escritura
provino un nodo, y no existe una frontera explícita entre procedencia descriptiva y autorización.

## Proposed change

Endurecer la procedencia del motor de memoria sin cambiar su arquitectura (zero-dependencies,
`node:sqlite`, migraciones idempotentes, diseño congelado `DESIGN-memory-engine-v0.2.0.md`):

1. **Formalizar `source` como atributo de procedencia** resuelto exclusivamente por el runtime:
   cada superficie de escritura confiable registra un valor propio y estable
   (`mcp:ancleto-memory`, `cli:import`, `runtime`, y `agent:<rol>` cuando el runtime lo provea),
   y un `source` forjado por el caller NO tiene efecto.
2. **Exponer la procedencia en la lectura de operador** (`listNodes`, `ancleto memory list --json`),
   manteniendo ocultos los campos gestionados por el runtime en la lectura orientada al LLM
   (`searchMemory`), preservando el encapsulamiento de las firmas MCP.
3. **Documentar la frontera auditoría vs enforcement**: la procedencia es un dato descriptivo; el
   motor NO autoriza ni deniega escrituras en base a ella. En la arquitectura actual (MCP stdio
   sin canal de identidad autenticado) el enforcement de ownership no es sostenible y NO SHALL
   prometerse.
4. **Extender** `DESIGN-memory-engine-v0.2.0.md` con la semántica de procedencia (sin reescribirlo).

## Scope

In scope:
- Semántica y vocabulario de `source` como procedencia (runtime-owned).
- Registro de valores de procedencia por superficie de escritura (MCP, import CLI, runtime).
- Exposición de `source` en `listNodes` y en `ancleto memory list --json`.
- Invariante de no-forja (args forjados ignorados) formalizado y testeado.
- Frontera auditoría vs enforcement documentada en `design.md` y en `DESIGN`.
- Tests de motor y de integración MCP.

Out of scope:
- Enforcement de autorización por actor (requiere un canal de identidad autenticado por
  llamada/tool, que la arquitectura actual no provee).
- Identidad del rol del LLM: no es observable por el server MCP; auto-declararla sería
  insostenible y NO SHALL registrarse como verificada.
- Cambios de schema de `memory.db`: se extiende el uso de `source`, NO se crea estructura nueva.
- Exponer procedencia en `searchMemory` ni en las firmas JSON Schema de las tools MCP.
- UI o comandos nuevos más allá de `memory list`.
- Nuevas dependencias de runtime.

## Risks

- **Confundir procedencia con autorización**: mitigación — requirement explícito y `design.md`
  que separan auditoría (descriptiva) de enforcement (no implementado).
- **Romper el encapsulamiento MCP**: mitigación — la procedencia sigue fuera de los `inputSchema`
  (`test/memory-engine.test.js:367-373`) y fuera de `searchMemory` (`test/memory-engine.test.js:171-175`).
- **Falsa sensación de identidad de emisor**: mitigación — vocabulario acotado a superficies de
  escritura del runtime; el rol del LLM NO se registra como verificado.
- **Cambio de valor del import (`'import'` → `cli:import`)**: mitigación — no hay contrato ni test
  que fije el literal; se documenta en la delta spec y se cubre con test.
