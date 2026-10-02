# Propuesta: Dynamic Frontmatter Adapters

## Problema

El adaptador de frontmatter vive inline en `src/cli/index.js` (~150 líneas de lógica de adaptación
mezcladas con el flujo de instalación). Cada nuevo host o ajuste requiere editar el monolito de la CLI.
Además:

- `cursor` y `roo` no pasan por el adaptador (solo soportan skills, y las skills no se adaptan).
- `ancleto check` valida presencia de archivos pero no valida que el frontmatter instalado coincida con
  la salida del adaptador para el host configurado.
- No hay un contrato puro y testeable entre "frontmatter de origen + host → frontmatter adaptado".

## Solución

Extraer el adaptador a un módulo propio (`src/core/adapters/frontmatter.js`) con contrato de función
pura: `(content, host, assetKind, name) → adaptedContent`. Extender la cobertura a skills (no solo
agents) para hosts que lo necesiten. Integrar con `ancleto check` (validación de frontmatter) y
`ancleto upgrade` (re-aplicación automática, ya lo hace vía `installAgentAssets`).

## Alcance

### Incluye

- Extracción a `src/core/adapters/frontmatter.js` (función pura, sin E/S).
- Extender `AGENT_ADAPTER_HOSTS` para incluir `cursor` y `roo` (passthrough con aviso si no hay
  formato documentado).
- Adaptación de frontmatter de skills (no solo agents) cuando el host lo requiera.
- `ancleto check` valida que el frontmatter instalado coincida con la salida del adaptador.
- Manejo explícito de agent desconocido: passthrough con aviso a stderr.

### No incluye

- Cambios a archivos de skills/agents/commands de origen (la adaptación es en tiempo de instalación).
- Soporte MCP multi-host (fuera de alcance, ya documentado como deuda).
- Tier/registro desacoplado de `.opencode` (deuda futura, no bloqueante).
- Cambios al formato de Antigravity ya especificado en `skill-frontmatter-adapters`.

## Riesgos

- **Regresión en opencode**: el default debe seguir siendo identidad byte-a-byte. Mitigación: tests
  explícitos de identidad para opencode.
- **Antigravity tool IDs**: la propuesta menciona IDs (`read_file`, `write_file`, etc.) que difieren de
  los IDs verificados en la tabla de frontmatter de Antigravity (`view_file`, `replace_file_content`,
  etc.). Se preserva el comportamiento actual (especificado en `skill-frontmatter-adapters`).
- **`ancleto check` falso positivo**: si el usuario edita manualmente el frontmatter instalado, check
  reportaría divergencia. Mitigación: check compara contra la salida del adaptador, no contra el origen;
  si el usuario editó, el aviso es legítimo (el archivo no es el que el adaptador produciría).

## Dependencias

- Existing spec: `aspec/specs/skill-frontmatter-adapters/spec.md` (source of truth para reglas de
  adaptación por host).
- Existing spec: `aspec/specs/agent-install-routing/spec.md` (ruteo por host).
