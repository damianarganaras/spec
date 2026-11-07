# Tasks: Preservación del fin de línea por línea al reconciliar bloques legacy

> Change funcional de la release 0.23.0. Sin dependencias nuevas, sin cambio de schema.

## Implementación

- [x] 1. `src/cli/index.js` (`reconcileLegacyBlocks`): reemplazar el re-join con el EOL dominante por
  la preservación del EOL por línea, manteniendo el early return `removed === false` byte-idéntico.
  La división debe capturar el EOL de cada línea y el armado debe usar el EOL propio de cada línea
  superviviente, sin cambiar qué líneas constituyen el run legacy ni el estado de la línea final.

## Pruebas

- [x] 2. `test/cli.test.js`: agregar tests junto a los existentes `sin run legado y con EOL mixto...`
  (~5305) y el test de fences (~5318). Cubrir: archivo de EOL mixto con eliminación de un run legacy
  conserva el EOL de cada línea superviviente; sin run legacy el contenido se devuelve byte a byte;
  un archivo CRLF homogéneo sigue siendo CRLF; un archivo LF homogéneo sigue siendo LF; la
  eliminación no agrega ni quita la línea final. Listo cuando `node --test test/cli.test.js` (ruta
  explícita) pasa en verde y `npm run lint` no reporta errores.

## Validación

- [x] Cerrar con las validaciones declaradas en `PRODUCT.md` → `## Project Commands`: `npm run lint`
  y `npm test`. Registrar cualquier omisión; no inventar comandos no declarados.
