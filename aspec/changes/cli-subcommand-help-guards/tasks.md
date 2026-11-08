# Tasks: Guard de `--help` sin ejecución en subcomandos de la CLI

## 1. Guard central de ayuda en la CLI

- [x] 1.1 En `src/cli/index.js`, agregar un guard central en el dispatch (`switch (cmd)`, ~:4861) que,
  antes de invocar el handler, detecte `--help`/`-h` en cualquier posición del argv del subcomando
  para el conjunto `install`, `update`, `upgrade`, `init`, `memory`, `import`, `export`, `mcp`,
  `specs` (nivel superior), `specs merge` y `projects` (nivel superior y sus subcomandos `scan`,
  `prune`, `update` y `list --update`); imprimir el uso a STDOUT y salir con exit code 0.
- [x] 1.2 Definir el texto de uso por comando de forma consistente con la sinopsis de la ayuda global
  `HELP`, sin omitir flags documentados; puede mantenerse como constantes por comando. Para `memory`
  y `projects` cubrir la lista que hoy se imprime a stderr (~:554) y para `specs` incluir `specs check`
  y `specs merge`. El guard no debe interceptar `discovery` ni la ayuda global.
- [x] 1.3 Acotar el guard de `specs` a nivel superior y a `merge`; `specs check --help` queda fuera.
- [x] 1.4 Acotar el guard de `projects` a nivel superior y a todos sus subcomandos, e incluirlo en la
  delegación de `list --projects`; `list` sin `--projects` queda fuera. No tocar el parseo de flags,
  los textos de error ni `src/core/**`.

## 2. Tests de comportamiento

- [x] 2.1 En `test/cli.test.js`, agregar un helper que capture bytes y `mtime` de `.ancletorc` y de
  todos los archivos bajo `.opencode/**`, y usarlo en las aserciones de cero escrituras.
- [x] 2.2 En `test/cli.test.js`, agregar tests spawn para `install`, `update`, `upgrade` e `init` con
  `--help`: exit code 0, uso en STDOUT y cero escrituras en un directorio temporal.
- [x] 2.3 En `test/cli.test.js`, agregar tests spawn para `memory` (incluido `memory <subcomando>
  --help`), `import`, `export` y `mcp`: exit code 0, uso en STDOUT y cero escrituras.
- [x] 2.4 En `test/cli.test.js`, agregar tests spawn para `specs` y `specs merge` con `--help`: exit
  code 0, uso en STDOUT con las formas de `specs check`/`specs merge`, y cero escrituras.
- [x] 2.5 En `test/cli.test.js`, agregar tests spawn para `projects --help`, `projects scan --help`,
  `projects prune --help`, `projects update --help` y `projects list --update --help` con
  `ANCLETO_PROJECTS_FILE` apuntando a un archivo temporal: exit code 0, uso en STDOUT y bytes/`mtime`
  del registro idénticos antes y después.
- [x] 2.6 En `test/cli.test.js`, agregar un test que recorra todo el conjunto guardado con `-h` y
  verifique equivalencia con `--help`: uso en STDOUT, exit code 0 y cero escrituras.
- [x] 2.7 En `test/cli.test.js`, agregar tests de cero escrituras en un proyecto ya inicializado, de
  `discovery --help` y ayuda global sin cambios, y de invocaciones sin `--help` sin cambios.
- [x] 2.8 En `test/cli.test.js`, agregar tests de que los read-only (`check`, `doctor`, `stats`,
  `list` sin `--projects`, `affected` y `specs check`) quedan fuera del guard.
- [x] 2.9 Mantener verdes los tests existentes de ayuda global (~:3037-3046, ~:3872-3879) y de
  `discovery --help` (~:6332-6336).

## 3. Validación

- [x] 3.1 Correr la validación acotada con ruta explícita: `node --test test/cli.test.js`.
- [x] 3.2 Correr `npm run lint`.
- [x] 3.3 Correr `npm test` (comando declarado).
- [x] 3.4 Confirmar que no cambiaron `src/core/**`, el texto de ayuda de `discovery`, la ayuda global
  ni el comportamiento de los subcomandos read-only, y que `projects` sí quedó bajo el guard.
