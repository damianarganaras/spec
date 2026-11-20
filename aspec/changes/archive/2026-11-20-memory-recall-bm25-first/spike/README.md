# Spike: recall de memoria BM25-first

Artefactos del spike de medición del change `memory-recall-bm25-first`. Preservados
aquí porque `%TEMP%` no es durable. No se incluye la base SQLite (`memory.db`,
`-wal`, `-shm`): son datos, no evidencia versionable.

## Objetivo

Medir si el orden de recall actual de la memoria (R0) puede mejorarse con un
ranking BM25-first, y verificar por separado si recencia y `confidence` aportan
algo. Como control se midió también el working context real (presupuesto 2000
tokens) con las `criticalKeys` obligatorias.

## Corpus

- 53 rules activas (`type='rule'`, `status='active'`).
- 50 de scope `project` (universo del working context) y 53 en total.
- `confidence` = 1.0 en las 53 (no hay señal discriminante).
- Copia read-only de `.ancleto/memory.db` usada para todas las corridas.

## Test collection

- 37 queries (32 de tema `Q01..Q32` + 5 temporales `T1..T5`).
- 98 pares query→rule con juicio graduado 0/1/2 (0 = no listado en `qrels`).
- Juez único LLM (sin acuerdo inter-anotador).
- Métricas calculadas sobre top-5: nDCG@5, Recall@5, MRR@5.
- Pools construidos con varios rankers (`02_rankers.mjs`), por lo que hay sesgo
  de pool: sólo se juzgaron documentos que algún ranker propuso.

## Resultados

| Ranker | nDCG@5 | Recall@5 | MRR@5 |
|---|---:|---:|---:|
| R0 actual (`compareRecall`) | 0.656 | 0.769 | 0.633 |
| bm25-first (R5) | 0.843 | 0.800 | 0.923 |
| sin recencia (R2) | 0.843 | 0.800 | 0.923 |
| recency-only (R3) | 0.120 | 0.155 | 0.172 |

## Hallazgo

- **BM25-first gana**: +0.187 nDCG@5, +0.290 MRR@5 sobre R0, con 20 wins /
  0 losses / 17 ties contra R0.
- **Recencia y confidence son inertes**: R2 (sin recencia) empata con R5, y
  R1 (con recencia) no supera a R2. El grid de `03_tuning.mjs` elige
  `0.75/0.25/0` pero la ventaja sobre `0.5/0/0.5` es ~0.0002; LOO = 0.861.
  Recency-only (R3) es el peor ranker (0.120), lo que confirma que ordenar por
  novedad no recupera relevancia.
- Implicación: el orden debe apoyarse en BM25 (con los documentos sin match al
  final), no en recencia ni en `confidence`.

## Re-medición del working context

`memspike2/measure.mjs` replica el packing real y llama
`renderWorkingContextBlock` (engine read-only) usando las `criticalKeys`
literales de `.ancletorc` como `required` real:

- `criticalKeys`: **7/7 incluidas** (replica y llamada real coinciden,
  `sameOrder: true`).
- Incluidas por presupuesto: **11/50** rules de scope `project`.
- 0/11 del cohorte más viejo (25%) sobrevive.
- Conclusión: `buildWorkingContext` queda **fuera de alcance** de este change;
  el problema a corregir es el ranking de recall, no el packing.

## Límites

- Corpus chico (53 rules) y queries derivadas de su contenido; puede no
  generalizar a memorias grandes.
- Juez único LLM, sin doble anotación ni kappa.
- Pools generados por los mismos rankers evaluados (sesgo de pool).
- Tuning y evaluación sobre el mismo set; el grid está sesgado. LOO (0.861)
  sólo mitiga parcialmente: falta un held-out real.
- La re-medición de working context usa una copia read-only, no producción.

## Re-correr

Los scripts asumen `DIR = %TEMP%\memspike` y rutas absolutas del repo. Para
reproducir:

```powershell
# 1) corpus (NO versionar la base)
New-Item -ItemType Directory -Force "$env:TEMP\memspike" | Out-Null
Copy-Item .ancleto\memory.db "$env:TEMP\memspike\memory.db"

# 2) extracción / ranking / tuning / contexto
node aspec\changes\memory-recall-bm25-first\spike\memspike\01_extract.mjs
node aspec\changes\memory-recall-bm25-first\spike\memspike\02_rankers.mjs eval
node aspec\changes\memory-recall-bm25-first\spike\memspike\03_tuning.mjs
node aspec\changes\memory-recall-bm25-first\spike\memspike\04_context.mjs
node aspec\changes\memory-recall-bm25-first\spike\memspike\05_verify_prod.mjs

# 3) re-medición con required real (copiar la base a memspike2)
New-Item -ItemType Directory -Force "$env:TEMP\memspike2" | Out-Null
Copy-Item .ancleto\memory.db "$env:TEMP\memspike2\memory.db"
node aspec\changes\memory-recall-bm25-first\spike\memspike2\measure.mjs
```

`measure.mjs` trae `REPO` y `COPY` hardcodeados; ajustarlos si el repo o el
`%TEMP%` cambian. Los outputs de referencia están en `memspike/*.json` y
`memspike2/measure_result.json`.
