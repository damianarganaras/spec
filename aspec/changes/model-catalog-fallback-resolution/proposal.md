# Proposal: model-catalog-fallback-resolution

## Intención

Corregir dos IDs de modelo inexistentes y hacer que la asignación de modelos deje de depender de IDs
inventados: introducir una **cadena de preferencia por agente** para el tier `minimo`, resuelta contra
un **snapshot de catálogo verificado y commiteado**, y endurecer el oráculo de `ancleto check` para
que un catálogo distinto entre `install` y `check` no produzca falsos `frontmatter diverge` ni quede
en silencio. Además, eliminar la detección muerta de Muse Spark y dejar `gratis` limitado al modelo
gratuito real (`opencode/big-pickle`, costo 0).

No se implementa todavía la pasada agéntica de selección de modelo (CH-12): este change deja la
interfaz pura y el catálogo inyectable como seam para reemplazar el snapshot estático sin cambiar el
contrato.

## Problema

- **IDs rotos.** `TIERS.normal.reviewer` declara `opencode-go/qwen3.6-plus` y `MUSE_SPARK_MODEL`
  declara `opencode/muse-spark-1.3-contributor-free`; ninguno existe en el catálogo de los
  proveedores (`opencode models <provider> --verbose`). El mirror de `reviewer` también arrastra el
  ID roto.
- **Detección muerta y silencio de catálogo.** `detectMuseSpark()` compara una línea contra un ID
  inexistente: siempre devuelve `false`. El CLI, en cambio, nunca valida que un ID exista antes de
  escribirlo. Un ID inválido falla recién en el host, no en `ancleto`.
- **Acoplamiento a un único modelo por tier.** `TIERS.minimo` mapea cada agente a un string fijo. Si
  ese modelo desaparece del proveedor, no hay fallback explícito: se escribe un ID muerto o se
  resuelve por casualidad.
- **Oráculo ciego a cambios de catálogo.** `check` acepta un estado de tier calculado en el momento;
  si el catálogo cambió desde el `install`, el mirror puede quedar fuera del conjunto aceptado y
  reportarse como divergencia falsa, o aceptarse sin avisar que el próximo `install`/`update`
  reescribirá el modelo.
- **`gratis` contaminado.** `MUSE_SPARK_MODEL` no es free tier (los `*-contributor` reales cuestan
  0.1/0.2) y `.ancletorc` del repo persiste el ID muerto.

## Cambio propuesto

1. **Reviewer verificado.** `TIERS.normal.reviewer` pasa a `opencode-go/qwen3.8-max`, el único
   `qwen3.8-*` verificado estrictamente más fuerte que `qwen3.7-plus` (2/6 vs 0.4/1.6).
   `profiles/test/agents/reviewer.md` se alinea al mismo proveedor; `tester` conserva
   `opencode-go/deepseek-v4.1-flash`.
2. **Cadena de preferencia para `minimo`.** Se agrega `TIER_CHAINS` exportado por
   `src/core/tier-models.js`, con la cadena por agente
   `commandcode/deepseek/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash` →
   `opencode/deepseek-v4.1-flash-free`. La forma de `TIERS` no cambia: `TIERS.minimo[agente]`
   conserva la cabeza de la cadena. Un resolver puro e inyectable elige el primer candidato presente
   en el catálogo y falla con error explícito si ninguno lo está.
3. **Snapshot de catálogo commiteado.** `src/core/model-catalog.json` guarda `generated_at`,
   proveedor de origen y método, con los IDs verificados. `scripts/refresh-model-catalog.mjs` lo
   refresca manualmente. Un guard de test falla si un ID de `TIERS`, `agents/*.md` o
   `profiles/*/agents/*.md` no figura en el snapshot; no hay red en CI.
4. **Oráculo por conjunto de aceptación completo.** `check` acepta como estado válido cualquier
   candidato de la cadena estática de `minimo` y calcula el aviso de tier con el modelo resuelto-ahora
   como primer estado. No se persiste el modelo resuelto por agente: `.opencode/.ancleto-tier` sigue
   guardando sólo el nombre del tier.
5. **Muse Spark eliminado.** Se eliminan `MUSE_SPARK_MODEL`, `detectMuseSpark`, la rama
   `ANCLETO_MUSE_SPARK` y la doble aceptación del oráculo. `gratis` queda en `opencode/big-pickle`
   (costo 0). Un `.ancletorc.gratisModel` desconocido se ignora y se normaliza al gratis resuelto en
   `install`/`update`.

## Alcance

**In scope**

- `src/core/tier-models.js`: reviewer corregido, `TIER_CHAINS`, resolver puro e inyectable, error
  explícito, eliminación de Muse Spark.
- `src/core/model-catalog.json` (nuevo) y `src/core/model-catalog.js` (loader + validación pura).
- `src/cli/index.js`: resolver la cadena en `install`, `init` y `import`; oráculo por conjunto de
  aceptación completo; normalización de `gratisModel` desconocido.
- `profiles/test/agents/reviewer.md`: `model: opencode-go/qwen3.8-max`. `tester.md` se mantiene.
- `scripts/refresh-model-catalog.mjs` (nuevo, manual y documentado).
- `test/agent-model-coherence.test.js`, `test/tier-models.test.js`, `test/cli.test.js`,
  `test/adapters-frontmatter.test.js`; nuevo `test/model-catalog.test.js`.
- `README.md`: sólo la tabla de tiers y la mención a Muse Spark (`README.md:272-276,516-543`).
- Delta specs en `aspec/changes/model-catalog-fallback-resolution/specs/`.

**Out of scope / no-goals**

- Implementar CH-12 (pasada agéntica de selección de modelo): sólo se deja el seam.
- Migrar `TIERS.normal` a `commandcode/`.
- `~/.config/opencode/**` (sólo se reporta que existe un bearer token, nunca se reproduce),
  `opencode.json`, `.opencode/**` editado a mano y `agents/*.md`.
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`.
- Validación de catálogo en tiempo de ejecución contra la red.

## Paths autorizados del change

- `src/core/tier-models.js`
- `src/core/model-catalog.js` (nuevo)
- `src/core/model-catalog.json` (nuevo)
- `src/cli/index.js`
- `profiles/test/agents/reviewer.md`
- `scripts/refresh-model-catalog.mjs` (nuevo)
- `test/agent-model-coherence.test.js`
- `test/tier-models.test.js`
- `test/cli.test.js`
- `test/adapters-frontmatter.test.js`
- `test/model-catalog.test.js` (nuevo)
- `README.md`
- `aspec/changes/model-catalog-fallback-resolution/**`

## Riesgos

- **(i) Divergencia falsa por catálogo cambiado.** Si el oráculo compara contra un único modelo
  resuelto-ahora, un `install` previo con otro candidato se reporta como divergencia. Mitigación: el
  conjunto de aceptación incluye todos los candidatos estáticos de la cadena; el resolved-now sólo
  manda para el aviso y para el error de resolución.
- **(ii) Silencio en la dirección inversa.** Instalar con el segundo candidato y luego recuperar la
  cabeza produce `resolved-now == fuente`, así que un aviso calculado sólo contra la fuente no
  dispararía. Mitigación: el aviso cuenta un agente cuando el mirror difiere del estado resuelto-ahora
  **o** el estado resuelto-ahora difiere de la fuente. Ambas direcciones quedan cubiertas por test.
- **(iii) `check` sin candidato disponible.** Si el catálogo no tiene ningún candidato de la cadena en
  el momento del check, resolver-ahora fallaría. Mitigación: `check` no aborta; acepta los candidatos
  estáticos como estados válidos y emite un aviso no bloqueante específico. `install`/`init`/`import`
  sí fallan con error explícito porque no pueden escribir un modelo inexistente.
- **(iv) `TIERS` cambia de forma y rompe consumidores.** Convertir `TIERS.minimo` en arrays rompería
  `applyTier`, el oráculo, dos guards y el spec vigente. Mitigación: `TIERS` conserva la forma
  agente→string con la cabeza de la cadena; la cadena vive en un símbolo nuevo.
- **(v) Snapshot desactualizado.** El snapshot es estático y puede envejecer. Mitigación: el guard
  detecta IDs inexistentes en el snapshot actual; el refresco es un comando manual documentado y el
  `generated_at` es auditable. No hay red en CI.
- **(vi) `readme-text-guards`.** Cambiar la tabla y la nota de Muse Spark puede romper guards de
  contenido del README. Mitigación: preservar los anclajes documentales existentes, ajustar sólo las
  líneas afectadas y correr `test/content-guards.test.js` antes de cerrar.
- **(vii) Costo de `reviewer`.** `qwen3.8-max` cuesta más que `qwen3.8-flash`. Es el tradeoff aceptado
  para `normal`, el tier de modelos más inteligentes; queda registrado en Decisiones.

## Supuestos

- El catálogo verificado el 2026-11-03 con `opencode models <provider> --verbose` es la fuente de
  verdad del snapshot inicial.
- La cadena estática de `minimo` es la misma para los diez agentes; cualquier divergencia futura por
  agente se expresa en `TIER_CHAINS`.
- `applyTier` sigue sin cambios de firma: recibe un mapa agente→modelo ya resuelto.
- No se persiste el modelo resuelto por agente; `.opencode/.ancleto-tier` guarda sólo el tier.
- El resolver es puro y recibe el catálogo como argumento; CH-12 podrá sustituir el snapshot por una
  fuente agéntica sin cambiar esa interfaz.
- El loader admite una ruta alternativa por `ANCLETO_MODEL_CATALOG` como seam de test/manual, con el
  mismo precedente que `ANCLETO_PROJECTS_FILE` y `ANCLETO_OPENCODE_DB`; sin la variable usa el
  snapshot commiteado.

## Decisiones

- **memory_key:** `tier-model-reviewer-qwen3.8-max`
  **Elección:** `TIERS.normal.reviewer` pasa a `opencode-go/qwen3.8-max`.
  **Descartado:** conservar `opencode-go/qwen3.6-plus` (ID inexistente); usar `qwen3.8-flash`
  (0.15/0.47), más barato pero más débil que `qwen3.7-plus` y contrario al criterio del reviewer.
  **Justificación:** es el único `qwen3.8-*` verificado estrictamente más fuerte que `qwen3.7-plus`
  (2/6 vs 0.4/1.6). `normal` es el tier de modelos más inteligentes, así que el mayor costo es un
  tradeoff aceptado.
  **Refs:** `change:model-catalog-fallback-resolution`; `path:src/core/tier-models.js`;
  `path:profiles/test/agents/reviewer.md`;
  `spec:agent-model-tiers#Guard estructural de coherencia entre canónica, tier minimo y catálogo`
  **Estado:** aprobado

- **memory_key:** `tier-minimo-fallback-chain-resolution`
  **Elección:** `minimo` resuelve por agente el primer candidato disponible de la cadena
  `commandcode/deepseek/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`. `TIER_CHAINS` se exporta desde `src/core/tier-models.js`;
  `TIERS.minimo` conserva la cabeza como string. Si ningún candidato está en el catálogo, error
  explícito.
  **Descartado:** cambiar `TIERS` a arrays por agente (rompe `applyTier`, el oráculo, dos guards y el
  spec vigente); mantener un único string fijo sin fallback (escribe IDs muertos sin señal).
  **Justificación:** la cadena elimina el ID inventado y conserva el contrato de `TIERS` que ya
  consumen el CLI y los guards. El error explícito evita el silencio.
  **Refs:** `change:model-catalog-fallback-resolution`; `path:src/core/tier-models.js`;
  `path:src/cli/index.js`;
  `spec:agent-model-tiers#Aplicación de tier idempotente y no-op sobre la canónica`
  **Estado:** aprobado

- **memory_key:** `model-catalog-snapshot-committed`
  **Elección:** se commitea `src/core/model-catalog.json` con `generated_at`, proveedor de origen y
  método (`opencode models <provider> --verbose`), más un guard que falla si un ID de `TIERS`,
  `agents/*.md` o `profiles/*/agents/*.md` no está en el snapshot. El refresco es manual
  (`scripts/refresh-model-catalog.mjs`); sin red en CI. El resolver es una función pura sobre un
  catálogo inyectable.
  **Descartado:** consultar el catálogo del proveedor en cada `install`/`check` (red, latencia,
  no determinista en CI); no validar IDs y dejar que fallen en el host.
  **Justificación:** el snapshot hace auditable y reproducible la disponibilidad sin costo de red. El
  seam desacopla CH-12 del origen del catálogo.
  **Refs:** `change:model-catalog-fallback-resolution`; `path:src/core/model-catalog.json`;
  `path:scripts/refresh-model-catalog.mjs`;
  `spec:agent-model-tiers#Guard estructural de coherencia entre canónica, tier minimo y catálogo`
  **Estado:** aprobado

- **memory_key:** `check-accepts-full-chain-acceptance-set`
  **Elección:** `check` acepta como estado válido cualquier candidato de la cadena estática y calcula
  el aviso de tier con el resuelto-ahora como primer estado y contra el mirror, sin persistir el
  modelo resuelto por agente.
  **Descartado:** persistir el modelo resuelto por agente en `.opencode/.ancleto-tier` (agrega estado
  y migración); aceptar sólo el resuelto-ahora (falso `frontmatter diverge` cuando el catálogo cambia
  entre `install` y `check`).
  **Justificación:** `.opencode/.ancleto-tier` guarda sólo el nombre del tier y `upgrade` no aplica
  tier. El conjunto completo evita la divergencia falsa; comparar también contra el mirror evita que
  la dirección inversa quede silenciosa.
  **Refs:** `change:model-catalog-fallback-resolution`; `path:src/cli/index.js`;
  `path:test/cli.test.js`;
  `spec:skill-frontmatter-adapters#ancleto check valida frontmatter de agents contra el adaptador y la canónica`
  **Estado:** aprobado

- **memory_key:** `muse-spark-detection-removed-gratis-free-only`
  **Elección:** se eliminan `MUSE_SPARK_MODEL`, `detectMuseSpark` y la rama `ANCLETO_MUSE_SPARK`;
  `gratis` queda en `opencode/big-pickle` (costo 0). Un `.ancletorc.gratisModel` desconocido se ignora
  y se normaliza al gratis resuelto en `install`/`update`.
  **Descartado:** corregir el ID a un `muse-spark-1.3-contributor` real (cuesta 0.1/0.2 y deja de ser
  free tier); mantener la detección aunque siempre devuelva `false`.
  **Justificación:** `gratis` debe seguir siendo costo 0; los `*-contributor` reales no son free tier.
  La detección es código muerto y su rama de entorno induce a error.
  **Refs:** `change:model-catalog-fallback-resolution`; `path:src/core/tier-models.js`;
  `path:README.md`;
  `spec:skill-frontmatter-adapters#ancleto check valida frontmatter de agents contra el adaptador y la canónica`
  **Estado:** aprobado

## Change Log

- 2026-11-03 — Creación del change (fuente: instrucción del usuario, contexto técnico verificado y
  catálogo del 2026-11-03). Clasificación `spec-required`; sin Work Item (Azure deshabilitado).
