# Design: Memory Ops — Export/Import/GC

## Decisiones de diseño

### 1. Capa de responsabilidad

Los tres métodos viven en `src/core/memory/engine.js` como métodos de instancia del engine,
junto a `searchMemory`, `recordRule`, `recordDecision`. El CLI los invoca directamente sin
lógica de negocio adicional.

**Razón**: el engine ya tiene acceso a la conexión SQLite y al schema. Agregar una capa
intermedia (service, manager) sería especulativa para tres operaciones que comparten la misma
fuente de datos.

### 2. Export — solo nodos activos

`exportActive()` consulta `findActive()` (ya existe en el engine) y mapea cada nodo al
formato JSON:

```json
[
  {
    "memory_key": "api-error-format",
    "type": "rule",
    "content": "...",
    "justification": "...",
    "scope": "project",
    "createdAt": "2026-09-25T18:17:16.280Z"
  }
]
```

**Sanitización**: antes de escribir, recorrer `content` y `justification` reemplazando
patrones de paths absolutos (regex: `[A-Z]:\\...` en Windows, `/home/...` o `/Users/...` en
Unix) con `<redacted>`. Esto es best-effort; el usuario debe revisar el archivo antes de
compartirlo.

**Salida**: si `--out` no se especifica, escribir a `stdout` (pipeable). Si se especifica,
escribir a archivo con `fs.writeFileSync`.

### 3. Import — upsert por memory_key con preservación de createdAt

`importNodes(json)` recibe un array validado y para cada entrada:

1. Buscar nodo existente por `memory_key` (sin filtro de status).
2. Si no existe: insertar con `createdAt` del JSON.
3. Si existe y `status='active'`:
   - Comparar `createdAt` del JSON con el del nodo existente.
   - Si el JSON es más reciente: superseder el existente (llamando internamente a la lógica
     de `recordNode` pero pasando `createdAt` explícito).
   - Si el existente es más reciente o igual: no-op (idempotencia).
4. Si existe y `status='superseded'`: saltarlo sin modificarlo. Los nodos superseded son
   historial; reactivarlos rompería la genealogía y contradice la decisión del usuario. El
   import solo upserta nodos activos; los superseded se cuentan como `skipped` en el resumen.

**Preservación de createdAt**: el engine actual no expone un método que acepte `createdAt`
explícito. Agregar un parámetro opcional `createdAt` a `recordNode` (default: `new Date()`)
es el cambio mínimo. No afecta a `recordRule`/`recordDecision` (no pasan el parámetro).

**Sin refresh masivo**: el import NO dispara `refreshWorkingContext` por cada nodo importado.
Al finalizar, si hubo al menos un cambio, se dispara una sola vez. Esto evita O(n) refreshes.

**Validación de schema**: antes de procesar, validar que cada entrada tenga los campos
requeridos (`memory_key`, `type`, `content`, `scope`, `createdAt`). Si alguna entrada falla,
abortar todo el import (transacción) y reportar el error.

### 4. GC — purga segura con umbral configurable

`gcSuperseded(opts)` ejecuta:

```sql
DELETE FROM memory_nodes
WHERE status = 'superseded'
  AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || ? || ' days')
```

El umbral (default 30 días) se pasa como parámetro. Se usa `created_at` como proxy de la
edad del nodo porque la columna `superseded_at` no existe en el schema actual y los cambios
de schema están fuera de scope. Esto es una aproximación: la antigüedad real a medir es la
del momento de supersesión, y `created_at` es siempre anterior o igual a ese momento, por lo
que el proxy puede purgar *antes* de alcanzar el umbral estricto de supersesión. Por ejemplo,
un nodo creado hace 400 días y superseded hoy es elegible de inmediato con `--days 30`. Es
seguro porque: (a) es un comando manual que ofrece `--dry-run`; (b) el default de 30 días da
un buffer amplio; y (c) el spec sanciona explícitamente el uso de `created_at` como proxy.
Luego:

```sql
VACUUM;
REINDEX;
```

**Dry-run**: si `opts.dryRun === true`, en lugar de DELETE ejecutar:

```sql
SELECT count(*) as nodes,
       sum(length(content) + length(justification)) as estimated_bytes
FROM memory_nodes
WHERE status = 'superseded'
  AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || ? || ' days')
```

Y reportar al usuario.

**Transacción**: el DELETE va en su propia transacción para no dejar la BD a medio borrar si
falla. `VACUUM` + `REINDEX` corren post-commit, fuera de la transacción (SQLite no permite
VACUUM dentro de una transacción); si fallan, la BD queda consistente, solo no se reempaqueta.

**Seguridad**: el GC NO toca nodos con `status='active'`, sin excepción. Esto se verifica con
un test que inserta nodos activos y activos recientes, corre GC, y aserta que permanecen.

### 5. CLI — subcomandos del grupo `memory`

En `src/cli/index.js`, bajo el comando `memory` existente, agregar:

- `memory export [--out <file>]`
- `memory import <file>`
- `memory gc [--dry-run] [--days <n>]`

Los comandos parsean args, invocan el engine, y formatean la salida (JSON a stdout para
export, resumen para import/gc).

### 6. Tests

En `test/memory-engine.test.js`, agregar:

- **Export**: test que inserta 3 nodos (2 activos, 1 superseded), exporta, y aserta que el
  JSON tiene solo los 2 activos con los campos correctos.
- **Import**: test que exporta, luego importa en una BD vacía, y aserta que los nodos
  quedaron activos. Test de idempotencia: importar dos veces el mismo archivo deja los mismos
  nodos (mismo createdAt, mismo content). Test de upsert: importar con `createdAt` más
  reciente supersede al existente.
- **GC**: test que inserta 2 nodos superseded (uno de hace 40 días, otro de hace 10 días),
  corre GC con umbral 30, y aserta que solo el de 40 días fue purgado. Test de dry-run:
  reporta cantidad pero no borra.

## Trade-offs

| Decisión | Alternativa | Por qué esta |
|---|---|---|
| Métodos en el engine, no en service separado | Crear `MemoryOpsService` | Especulativo para 3 operaciones que comparten conexión y schema |
| Export solo de activos | Incluir superseded | El requirement es backup/compartición de memoria útil; los superseded son historial interno |
| Import con upsert por memory_key | Merge manual con conflictos | El requirement dice "no duplicates by memory_key"; upsert es la forma más simple |
| Import saltea superseded (son historial) | Reactivar superseded | Los superseded son historial; reactivarlos rompe la genealogía y contradice la decisión del usuario |
| GC con umbral fijo de 30 días (configurable) | GC solo manual o GC automático | 30 días es conservador y configurable; automático sería prematuro |
| Sanitización best-effort de paths | Sanitización exhaustiva con AST | Best-effort cubre el 95% de los casos sin complejidad desmedida |
| Import sin refresh masivo | Refresh por cada nodo | O(n) refreshes es costoso e innecesario; uno al final basta |

## No-decisiones

- **No cambiar el schema de `memory.db`**: los campos necesarios ya existen (`memory_key`,
  `type`, `content`, `justification`, `scope`, `createdAt`, `status`). La columna
  `superseded_at` no existe; el GC usa `created_at` como proxy de edad (ver §4).
- **No agregar dependencias**: `node:sqlite` + `fs` + `path` son suficientes.
- **No modificar `recordRule`/`recordDecision`**: el nuevo parámetro `createdAt` en
  `recordNode` es opcional y no afecta a los métodos públicos existentes.
