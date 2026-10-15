# Optimización de tokens en Ancleto — estado, huecos y opciones

> Documento de análisis para decidir. No implementa nada: mide, ordena y propone caminos con
> tradeoffs explícitos. Audiencia: Damián.
>
> Base del barrido: `@ancleto/spec@0.11–0.12`, tier resuelto `normal`, checkout al 2026-10-14.
> Toda cifra sale de medición local del repo (no estimación de manual).

---

## 0. Resumen ejecutivo (leer esto primero)

Ancleto se vende con **dos promesas**:

1. **Herramienta SDD** (especificar → aplicar → verificar → archivar). ✅ **Sólida y especificada.**
2. **Optimizador de tokens** ("control estricto de tokens", README:13). ⚠️ **Implementada pero no
   especificada ni cerrada.**

El barrido confirma: hay **mucha maquinaria real** de ahorro (tiers, budget de pack, seed, memoria,
cap de output, `stats`), pero **ninguna capacidad la define como garantía** y **no hay lazo cerrado**
entre lo que se mide y lo que se decide. La promesa 2 es hoy *un conjunto de mecanismos dispersos*,
no *un invariante del producto*.

**Decisión pendiente (la que este documento ayuda a tomar):** ¿"optimizador de tokens" es una
**capacidad nueva** con Requirements medibles y tests que la guarden, o es un **atributo transversal**
que se agrega a las capacidades existentes? El resto del documento desglosa el costo real y las
opciones; la sección §7 tiene la matriz de decisión.

<!-- Damián, optimizar tokens es como elegir la cafetera: podés comprar la máquina industrial que
     hace cincuenta tazas por minuto, pero si no decidís cuántas tazas vas a tomar —y cuándo—,
     terminás sirviendo una jarra fría y pagando los granos igual. El tamaño de la cafetera no te
     salva; la decisión (cuánto, para quién, ahora o después) es lo que ahorra el café. -->

---

## 1. Qué significa "optimizar tokens" aquí

Hay que separar **tres costos distintos**, porque cada uno tiene un lever diferente:

| Tipo de costo | Qué lo genera | Se paga |
|---|---|---|
| **Fijo por request** | Schemas de las tools MCP + bloques inyectados (`<ProjectMemoryRules>`, `<ProjectTopology>`) + listas de skills/commands/agents | En **cada** request, se usen o no |
| **Por invocación** | Cuerpo de `SKILL.md`, cuerpo de agents, comandos | Solo cuando se invoca/lee |
| **Por exploración** | Barrido del repo para responder algo | Cuando el contexto no está a mano (o está stale) |

La mayoría de las discusiones de "optimizar tokens" mezclan los tres. El lever grande está en el
**fijo por request**; el más barato de atacar sin perder función es **evitar la exploración** (seed +
memoria); el gate de tamaño de assets es **el más chico de los tres** (§5).

---

## 2. Modelo de costo real: ¿cuándo se paga cada cosa?

```
Cada request (SIEMPRE)                Solo cuando se invoca         Solo cuando hace falta
┌──────────────────────────┐          ┌────────────────────┐        ┌────────────────────┐
│ schemas MCP (~1.3k)      │          │ SKILL.md (cuerpo)  │        │ references/        │
│ <ProjectMemoryRules>     │   ───►   │ agents/*.md        │  ───►  │ (lazy: on-use)     │
│ <ProjectTopology>        │          │ commands/*.md      │        │ pack Repomix       │
│ descriptions 21 skill    │          └────────────────────┘        └────────────────────┘
│ descriptions 16 cmds     │
│ descriptions 10 agents   │
└──────────────────────────┘
```

Consecuencia no obvia: **el cuerpo de una skill no cuesta siempre**, cuesta al invocarla. Lo que
cuesta *siempre* es su **description**. Eso reordena las prioridades de §5.

---

## 3. Inventario: qué existe hoy (y dónde)

| Mecanismo | Ubicación | Qué reduce | ¿Especificado? | ¿Medido? |
|---|---|---|---|---|
| Tiers `normal/minimo/gratis` → modelo por tier | `src/core/tier-models.js`, `TIERS` en `src/cli/index.js` | Costo por token del modelo | Parcial | No |
| Ignores + `--compress` por tier | `src/core/repomix-tier.js:4-8` | Tamaño del pack Repomix | No | No |
| `tokenBudget` del pack | `src/core/repomix-tier.js:7` + `src/cli/index.js:2001` | Tope duro del pack (solo `gratis`) | No | Estimado `len/4` |
| Exclusiones del discovery | `.ancletorc` → `discovery.exclude` | Archivos fuera del seed | No | No |
| Regeneración parcial (`impact`/`affectedDocs`) | `src/cli/index.js:1815+`, `seed-map.json` | Re-escribir solo docs afectados | Behavioral | No |
| Seed técnico (no barrer el repo) | `skills/ancleto-technical-discovery` | Exploración del repo | Behavioral | No |
| Memoria FTS5/BM25 vs re-explorar | `src/core/memory/*` | Exploración repetida | Sí | No |
| MCP opcional (engram off por defecto) | `README.md:118-134` | Fijo por request (~5.8k→~1.3k) | Documentado | Sí (tabla) |
| `ancleto stats` | `src/cli/index.js:2479+` | — (observa) | — | Sí (solo opencode) |
| Tope de output por agente | `agents/tester.md:170`, `agents/orchestrator.md:318-319` | Reinyección de raw returns | Behavioral | No |
| Truncamiento seguro de memoria | `<ContextOverflowWarning>` (engine) | Bloques de memoria inflados | Sí | No |

### 3.1 Cifras medidas (este repo)

**MCP — costo fijo por request** (fuente: README, perfil por defecto):

| MCP | Tools | Tokens/request | Nota |
|---|---|---|---|
| `ancleto-memory` | 3 | ~500 | Default |
| caveman | 5 | ~830 | Default |
| engram | 18 | ~4.900 | **Opt-in** (`--with-engram`) |
| **Default combinado** | 8 | **~1.300** | engram excluido |

**Skills — descriptions (always-on):** ~1.9k tokens totales en las 21. Outliers:

| Skill | description | % del total |
|---|---|---|
| `ancleto-technical-discovery` | ~235 tok | 12% |
| `ancleto-upgrade` | ~184 tok | 9,5% |
| Las otras 19 | ~80 tok promedio | — |

**Skills — cuerpos (on-invoke):** 430–2.537 tok. Los más grandes: `ancleto-upgrade` (~2.537),
`ancleto-archive` (~1.396), `ancleto-verify` (~1.328), `ancleto-update` (~1.231).

**`references/` (lazy):** solo 2 skills usan el patrón — `technical-discovery` (13 refs, ~3.9k) y
`upgrade` (1 ref, ~4.1k). No impactan el costo always-on.

**Tiers (pack):**

| Tier | Ignores extra | `--compress` | `tokenBudget` | ¿Aborta? |
|---|---|---|---|---|
| `normal` | — | No | `null` | **No** |
| `minimo` | `test/**`, `docs/**`, `**/*.md` | Sí | `null` | **No** |
| `gratis` | idem `minimo` | Sí | `50000` | Sí |

---

## 4. Huecos detectados (por qué la promesa 2 es "débil en el contrato")

1. **No existe una capacidad "token-economy".** Las specs cubren discovery, memoria, instalación,
   routing, review, etc., pero ninguna define *"Ancleto optimiza tokens"* como garantía verificable.
   Sin Requirement → sin test que la proteja.
2. **`stats` mide, no actúa.** Es telemetría de lectura sobre sesiones de opencode. Un *optimizador*
   cerraría el lazo (medir → ajustar tier/contexto). Hoy son presets estáticos + observación; nada
   consume `stats` para decidir.
3. **El budget solo es "estricto" en `gratis`.** En `normal` y `minimo` el `tokenBudget` es `null`
   (`repomix-tier.js:5-6`): no hay tope. Y la estimación es `content.length/4` (`cli:1999`), cruda.
4. **La frescura del seed prioriza estabilidad sobre tokens.** Con `impact: minor` no regenera
   (por diseño). El contexto puede quedar *stale* en silencio y el costo se paga después
   re-explorando: tensión directa con la promesa 2.
5. **El overhead de MCP se divulga, no se optimiza solo.** `--no-mcp` / `--with-engram` son
   decisiones manuales; caveman entra por defecto pero **su ahorro real no se mide**.
6. **No hay gate de tamaño de assets.** Hubo una "2da pasada de optimización de skills (−20%)"
   (BACKLOG:57) **manual**. Nada impide que un `SKILL.md` crezca y reintroduzca costo sin que nadie
   lo note.

---

## 5. Punto 6 en detalle: gate de costo de assets

### 5.1 Hallazgo clave

**No hay flujo de creación de skills** en Ancleto (no existe `skill-create`, scaffold ni generador).
Entonces no hay un "momento de creación" donde colgar un límite. Pero hay algo más fuerte:

> Todo asset está en git y **CI corre `node --test`** → el gate real vive en
> `test/content-guards.test.js`, que **ya** parsea `skills/`, `commands/` y `agents/` y asserta
> propiedades sobre todos (idioma, permisos, topes de output, referencias válidas).

Agregar una guarda de tamaño ahí no requiere infra nueva ni un flujo de creación.

### 5.2 Qué conviene limitar primero

| Superficie | Cuándo se paga | ¿Recortable sin perder función? |
|---|---|---|
| **Descriptions** | **Cada request** | Difícil: los ejemplos que disparan el match de frases vagas **son** la description. Recortar = perder triggers. |
| Cuerpo `SKILL.md` | On-invoke | Sí: empujar a `references/` (lazy). |
| `references/` | On-use | Ya es lazy → bajo impacto. |

Conclusión: **la superficie always-on son las descriptions**, y ahí el recorte **no es gratis**.
El cuerpo sí se puede aligerar sin perder función (mover a `references/`).

### 5.3 Dos capas que no rompen nada

- **Garantía (CI):** aserción en `content-guards.test.js` que falle si un asset nuevo supera un
  *ceiling*, y si un asset viejo **crece** (patrón *ratchet / no-growth*).
- **Ergonomía (opcional):** plantilla para crear skills a mano, con los límites escritos y la regla
  "lo pesado va a `references/`". No requiere un `skill-create`; el test *es* el guard.

### 5.4 Ratchet / no-growth: por qué no mata funcionalidad

```
baselines.json (congelado al crear el gate)
  "skills/ancleto-upgrade/SKILL.md": 10148 B
  "skills/ancleto-technical-discovery/SKILL.md": 3711 B
  ...
  "__default__": 6000 B          ← techo para assets NUEVOS

test: assert current <= baseline[file] ?? __default__
```

- **Las viejas no se tocan** → nadie reescribe `ancleto-upgrade` para pasar el gate → **cero
  pérdida de funcionalidad**.
- **No pueden crecer** → cualquier PR que engorde un asset falla CI y debe justificar o mover a
  `references/`.
- **Las nuevas nacen acotadas** → usan `__default__`.

### 5.5 Prioridad del "resto" (mayor → menor retorno)

1. **Ratchet primero** — retorno inmediato, cero rewrites.
2. **Bajar los 2 outliers always-on** (`technical-discovery` 235→~150, `upgrade` 184→~120) —
   **tradeoff de matching, no gratis**: hacerlo con ojo y midiendo triggers.
3. **Migrar cuerpos pesados a `references/`** (lazy, función intacta) — hoy solo 2 skills usan el patrón.
4. **Reportar antes de bloquear** en cuerpos: `warning` informativo ≠ `error`.

### 5.6 Caveat honesto (no invertir en el lever equivocado)

Los assets markdown son el **lever chico**. El costo always-on grande son los **schemas MCP**
(~1.3k, ya divulgado) y los **bloques inyectados**. Un gate de tamaño vale por **evitar la deriva**
de assets, no por el ahorro de hoy:

```
Ratchet de assets    ██░░░░░░░░░░   barato, evita deriva
MCP + bloques        ██████████░░   el costo real
Exploración (seed)   ████████░░░░   el más caro de todos, ya mitigado
```

---

## 6. Opciones para la promesa 2 (no son excluyentes)

### Opción A — Capacidad nueva "token-economy"
Spec propia (`aspec/specs/token-economy/spec.md`) con Requirements medibles: ceilings de assets,
divulgación de costo MCP, invariante de `stats`. Guardas en `content-guards.test.js`.
- **Pro:** la promesa queda especificada y testeada; cierra el hueco §4.1.
- **Con:** una capacidad más; riesgo de que se vuelva burocracia si no hay lazo real.

### Opción B — Atributo transversal
No crear spec nueva; agregar Requirements de costo a las capacidades existentes (discovery,
agent-install-routing, memory-engine).
- **Pro:** sin capacidad nueva; el costo queda junto a su dueño.
- **Con:** el "optimizador de tokens" queda invisible como concepto; difícil de comunicar/monitorear.

### Opción C — Cerrar el lazo con `stats`
Que `ancleto stats` (o un `ancleto doctor --token`) **sugiera** tier/ajustes según consumo real.
- **Pro:** convierte telemetría en optimización real; único mecanismo que ataca el costo *real*.
- **Con:** solo opencode; requiere heurísticas y puede errar; riesgo de "optimizar a ciegas".

### Opción D — Solo ratchet + divulgación (mínimo)
Gate de tamaño de assets (§5) + ampliar la tabla de costo MCP del README.
- **Pro:** barato, sin capacidad nueva, frena la deriva.
- **Con:** no cierra la promesa como garantía; sigue siendo "mecanismos dispersos".

---

## 7. Matriz de decisión

| | Cierra la promesa §4.1 | Ataca el costo real | Costo de implementación | Riesgo |
|---|---|---|---|---|
| **A** Capacidad nueva | ✅ | ⚠️ parcial | Medio | Burocracia |
| **B** Transversal | ⚠️ | ⚠️ parcial | Bajo | Invisibilidad |
| **C** Lazo con `stats` | ✅ | ✅ | Alto | Optimizar a ciegas |
| **D** Ratchet + divulgación | ❌ | ❌ | Muy bajo | Queda a medias |

**Lectura sugerida (no vinculante):** `D` como paso inmediato → `A` como marco → `C` como
horizonte. `B` es un atajo razonable si no se quiere una capacidad nueva.

---

## 8. Preguntas abiertas

- ¿"Optimizador de tokens" es **una capacidad** (A) o un **atributo transversal** (B)?
- ¿`stats` debe **cerrar el lazo** (C) o quedar como telemetría honesta?
- ¿El "barrido" que menciona la idea original es `ancleto discovery --check`?
- ¿Los tiers deben tener `tokenBudget` en `normal`/`minimo` (hoy `null`), o el tope solo en `gratis`
  es una decisión deliberada?
- ¿Vale medir el ahorro *real* de caveman (default) o se da por bueno?

---

## 9. Anexo: dónde tocar cada cosa (para la eventual implementación)

| Objetivo | Archivo |
|---|---|
| Ceiling/ratchet de assets | `test/content-guards.test.js` (nuevo describe) + `test/asset-cost-baselines.json` |
| Descriptions outlier | `skills/ancleto-technical-discovery/SKILL.md`, `skills/ancleto-upgrade/SKILL.md` (frontmatter) |
| Migrar cuerpo → references | `skills/*/SKILL.md` + `skills/*/references/` |
| `tokenBudget` por tier | `src/core/repomix-tier.js:4-8` |
| Estimación de tokens del pack | `src/cli/index.js:1999` |
| Lazo con `stats` | `src/cli/index.js` (sección `stats`, ~2479+) |
| Divulgación de costo | `README.md` (sección MCP) |
