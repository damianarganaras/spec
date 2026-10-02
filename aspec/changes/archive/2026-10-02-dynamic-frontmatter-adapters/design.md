# Diseño: Dynamic Frontmatter Adapters

## Arquitectura

### Módulo: `src/core/adapters/frontmatter.js`

Función pura exportada:

```js
export function adaptFrontmatter(content, host, assetKind, name)
// → string (contenido completo con frontmatter adaptado + body verbatim)
```

**Contrato:**
- Input: `content` (string completo del .md), `host` (string), `assetKind` ('agents' | 'skills' | 'commands'), `name` (string, nombre del asset sin extensión).
- Output: string con el mismo body, frontmatter adaptado según host.
- Sin E/S, sin dependencias externas, sin estado global.
- Host desconocido → passthrough (content sin cambios) + aviso a stderr.

**Internamente reutiliza** `parseFrontmatter` / `serializeFrontmatter` (se mueven al módulo o se
importan desde un helper compartido).

### Dispatch por host

```
adaptFrontmatter(content, host, assetKind, name)
  ├── host === 'opencode'         → identity (passthrough)
  ├── host === 'antigravity'
  │     ├── assetKind === 'agents'  → adaptAntigravityFrontmatter(content, name)
  │     └── else                    → identity
  ├── host in {claude, vscode, copilot}
  │     ├── assetKind === 'agents'  → dropKeys(content, AGENT_ADAPTER_DROP)
  │     └── else                    → identity
  ├── host in {cursor, roo}
  │     └── identity + warning stderr ("no documented frontmatter adaptation for host 'X'")
  └── unknown host                → identity + warning stderr ("unknown agent 'X', passthrough")
```

### Reglas de adaptación (preservadas del spec existente)

| Host | Agents | Skills | Commands |
|------|--------|--------|----------|
| opencode | identity | identity | identity |
| claude | drop `mode/color/temperature/permission/model/tools` | identity | identity |
| vscode | drop `mode/color/temperature/permission/model/tools` | identity | identity |
| antigravity | transformación completa (spec `skill-frontmatter-adapters`) | identity | N/A (empaquetados como skills) |
| cursor | N/A (agents: null) | identity + warning | N/A |
| roo | N/A (agents: null) | identity + warning | N/A |
| copilot | drop `mode/color/temperature/permission/model/tools` | N/A (skills: null) | identity |

**Nota:** `cursor` y `roo` no tienen formato de frontmatter de skills documentado que difiera del
estándar. La adaptación es identity con aviso. Si en el futuro se documenta un formato propio, se
agrega una rama en el dispatch sin tocar el resto.

### Integración

#### `installAgentAssets()` (src/cli/index.js)

Reemplaza la llamada inline a `adaptFrontmatter` por el import del módulo:

```js
import { adaptFrontmatter } from '../core/adapters/frontmatter.js'
```

El flujo no cambia: `copyDirTransformed` y `installAssetFiles` ya llaman a `adaptFrontmatter`; solo
cambia el origen de la función.

#### `ancleto check` (src/cli/index.js)

Después de validar presencia de archivos, para cada archivo `.md` instalado en directorios de agents:

1. Lee el contenido instalado.
2. Lee el contenido de origen (`src/<cat>/<file>`).
3. Aplica `adaptFrontmatter(origen, host, cat, name)`.
4. Compara con el instalado. Si difiere → reporta divergencia.

**Scope:** solo agents (las skills no se adaptan hoy excepto para antigravity commands→skills, que
ya tienen su propia lógica). El check de skills se puede agregar cuando haya adaptación de skills
para algún host.

**No bloqueante:** la divergencia de frontmatter se reporta como warning (⚠), no como faltante (✖).
Exit code no cambia por divergencias de frontmatter (solo por faltantes).

#### `ancleto upgrade`

Ya re-aplica el adaptador vía `installAgentAssets` → `adaptFrontmatter`. Sin cambios necesarios: la
extracción al módulo es transparente para upgrade.

### Estructura de archivos

```
src/
  core/
    adapters/
      frontmatter.js        ← NUEVO: adaptFrontmatter + helpers (parse/serialize)
  cli/
    index.js                ← IMPORTA desde core/adapters/frontmatter.js
```

`parseFrontmatter` y `serializeFrontmatter` se mueven al módulo del adaptador. Si otro punto del CLI
los necesita, se re-exportan desde el módulo.

### Tests

- `test/adapters-frontmatter.test.js`: tests unitarios del módulo puro.
  - Identity para opencode (byte-a-byte).
  - Drop de claves para claude/vscode/copilot agents.
  - Transformación completa para antigravity agents (reutiliza los scenarios del spec existente).
  - Passthrough + warning para cursor/roo.
  - Passthrough + warning para host desconocido.
  - Sin frontmatter → content sin cambios.
  - Skills no se adaptan (identity) para todos los hosts excepto antigravity commands→skills.

## Decisiones de diseño

1. **Función pura, no clase ni registry**: un dispatch con `if/switch` es más simple que un registry
   de adaptadores por host. No hay extensión dinámica de hosts; cada host nuevo requiere un cambio
   explícito en el código (y en el spec).

2. **Warning a stderr, no throw**: host desconocido o sin adaptación documentada no debe romper la
   instalación. El aviso es informativo.

3. **Check no bloqueante por frontmatter**: la divergencia de frontmatter puede ser legítima (edición
   manual del usuario). Reportar como warning, no como error.

4. **No se adapta skills (por ahora)**: ningún host tiene un formato de skills que difiera del
   estándar Agent Skills. Cursor y Roo leen skills con el mismo frontmatter. Si cambia, se agrega la
   rama en el dispatch.

## Future work (fuera de este change)

- MergeMcp multi-host: hoy escribe en `opencode.json` aunque el host no sea opencode.
- Tier/registro desacoplado de `.opencode`.
- Adaptación de skills si un host documenta un formato propio.
