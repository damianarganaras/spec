# Tasks: Aviso de bundle legacy sin intención MCP en el import

> Change funcional de la release 0.23.0. Sin dependencias nuevas, sin cambio de schema.

## Implementación

- [x] 1. `src/cli/index.js` (`importCmd`): después de la validación existente de `manifest.mcp`,
  agregar una única línea de aviso no bloqueante cuando `manifest.mcp === undefined`, usando el
  mismo sink que el archivo ya usa para avisos no fatales (`console.warn`). No tocar la validación
  de array ni de entradas, ni ningún camino de escritura, ni el exit code.

## Pruebas

- [x] 2. `test/cli.test.js`: extender o agregar tests junto a los existentes
  `import con manifest.mcp ausente completa y trata la lista como vacía` (~4266) y los de rechazo
  (~4212/4231/4254). Aseverar: el aviso aparece una sola vez cuando `manifest.mcp` está ausente; no
  aparece cuando `manifest.mcp` es `[]`; el exit code es 0 en ambos casos; no se escribe archivo MCP
  por el aviso; un `manifest.mcp` no-array sigue fallando con exit 1. Listo cuando
  `node --test test/cli.test.js` (ruta explícita) pasa en verde y `npm run lint` no reporta errores.

## Validación

- [x] Cerrar con las validaciones declaradas en `PRODUCT.md` → `## Project Commands`: `npm run lint`
  y `npm test`. Registrar cualquier omisión; no inventar comandos no declarados.
