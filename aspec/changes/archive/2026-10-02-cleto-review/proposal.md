# Proposal: Skill `cleto-review` de revisión de código

## Problem

Hoy no existe una skill que revise la calidad interna del código generado: código repetido, métodos que duplican lógica ya existente en otro lugar, código ubicado en el módulo incorrecto y código sin uso. `ancleto-verify` verifica completitud contra los artifacts (tasks/specs/design), `agents/reviewer.md` verifica correctness y scope como subagente del orchestrator, y `ancleto-security` solo mira vulnerabilidades. Ninguno busca sistemáticamente duplicación, redundancia, mala ubicación o dead code, y ninguno acepta como scope un subconjunto declarado por el usuario (por ejemplo, "solo lo de los commits con `#123`").

## Proposed change

Crear la skill `ancleto-review` (comando `/cleto-review`) que, dado un scope declarado por el usuario, resuelve el diff correspondiente y reporta hallazgos de calidad interna con referencia `file:line` y recomendación concreta, sin modificar código. Los 4 detectores son: código repetido, método redundante (ya existe en otro lado), código mal ubicado y código sin uso. La skill lee fuera del diff solo para comparar (verificar duplicados, buscar llamadas, determinar ubicación correcta), pero solo reporta sobre el código dentro del scope.

## Scope

In scope:
- Nueva skill `skills/ancleto-review/SKILL.md` (solo lectura, sin binarios externos) + comando `commands/cleto-review.md`.
- Resolución de scope declarado por el usuario a lista de archivos/líneas: mensajes de commit con `#nroticket` (`git log --grep`), rangos (`main..HEAD`, `HEAD~n`), paths/directorios y diff del worktree.
- Los 4 detectores sobre el scope: repetido, redundante, mal ubicado, sin uso.
- Reporte estructurado por severidad (CRITICAL/WARNING/SUGGESTION) con `file:line` y recomendación accionable, reutilizando el formato de `agents/reviewer.md` (cap de 5 por severidad, sin pegar diffs).
- Instalación de la skill por host vía el mecanismo existente (`installAgentSkills`), sin lógica nueva de ruteo.

Out of scope:
- Auto-fix o refactorización automática (solo reporta, no edita).
- Métricas de complejidad, cobertura o performance.
- Cambios en `ancleto-verify`, `ancleto-security` o `agents/reviewer.md`.
- Grounding de Work Items de Azure DevOps (sigue siendo de `@context-resolver`).
- Nuevos gates de CI o linters (ver candidato B7 en BACKLOG.md).

## Risks

- Falsos positivos en "redundante" y "mal ubicado" (diferencia sutil ignorada, arquitectura desconocida): mitigación con heurística de degradación (ante duda, SUGGESTION > WARNING > CRITICAL) heredada de `ancleto-verify`.
- Scope `#nroticket` ambiguo (¿mensaje de commit? ¿rama? ¿Work Item?): mitigación definiendo la gramática de scope en el design y derivando a `@context-resolver` solo si hay referencia a Work Item.
- Solapamiento percibido con `reviewer`: mitigación documentando la frontera ("reviewer = ¿está bien hecho lo pedido? / review = ¿sobra, se repite o está mal ubicado?").
