# Tasks: fix-repair-mcp-noop

## 1. Implementación

- [x] 1.1 Implementar el predicado de escritura en `repairProjectMcp`: escribir sólo si el archivo no es parseable, si la estructura requiere normalización (raíz no-objeto o valor de esquema presente no-objeto), o si `fixed` no está vacío. Archivo: `src/cli/index.js`.
- [x] 1.2 Mover la creación del directorio del destino (`mkdir`) dentro de la rama de escritura. Archivo: `src/cli/index.js`.
- [x] 1.3 Eliminar `!existed` como motivo de escritura, de modo que un destino inexistente sin entradas que reparar o agregar no cree ni archivo ni directorio. Archivo: `src/cli/index.js`.
- [x] 1.4 Preservar en la misma rama el reemplazo ante error de parseo, la reparación de entradas rotas, la adición de nombres intencionados y la normalización de una raíz no-objeto. Archivo: `src/cli/index.js`.

## 2. Tests

- [x] 2.1 Cubrir que un destino sano no se reescribe: bytes y mtime idénticos, mensaje "MCP sanos" y exit code sin cambios. Archivo: `test/cli.test.js`.
- [x] 2.2 Cubrir que un destino inexistente sin entradas que reparar o agregar no crea el archivo ni el directorio. Archivo: `test/cli.test.js`.
- [x] 2.3 Cubrir la normalización estructural: raíz no-objeto (`null`, arreglo, string) y valor de esquema no-objeto (`{"mcp": "x"}`) se reemplazan; una clave de esquema ausente no se agrega si no hay entradas que agregar. Archivo: `test/cli.test.js`.
- [x] 2.4 Cubrir la preservación de comportamientos: reemplazo de JSON no parseable con su aviso, reparación de una entrada rota y adición de un nombre intencionado ausente. Archivo: `test/cli.test.js`.

## 3. Validación

- [x] 3.1 Ejecutar `npm run lint`.
- [x] 3.2 Ejecutar `npm test`.

## 4. Fase separada: archive y merge de specs

- [ ] 4.1 Fusionar el delta de `aspec/changes/fix-repair-mcp-noop/specs/project-portability/spec.md` en `aspec/specs/project-portability/spec.md` y promover las decisiones aprobadas; la promoción ocurre después del merge de specs y antes de mover el directorio del change. Ejecutar el archive con el flujo habitual.
