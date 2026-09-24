# Concise generation pipeline

Generation prioritizes signal over literal coverage. It runs in one sequential execution
with no subagents and exactly **one** Repomix pack. The result contains eight base documents
and up to three focused dossiers. All generated documents must be written in Spanish.

## 1. Global map

First run `ancleto discovery --check` and read its JSON. Its `config` is the resolved
`discovery` section of `.ancletorc`, including defaults, so it is the only configuration source
for this execution. Use `config.outputDir` as the only output location and copy the resolved
`config.exclude` globs into the pack command. Do not parse, create, or edit `.ancletorc` yourself.
Then run exactly once:

```bash
ancleto discovery --compress --ignore "<config.exclude joined by commas>"
```

`--check` and the final validation do not create packs. Do **not** run an uncompressed pack
first, do not run `--compress` a second time, and do not run `--include`: the single global
pack is sufficient context for every document in this seed. The CLI also merges
`discovery.exclude`; passing the resolved list makes the exclusion scope explicit and must
not be replaced with an empty `--ignore` flag.

Read the pack path printed by that one command. From its contents, identify the archetype,
entry points, main boundaries, and candidate units, then immediately write these Spanish
documents under `config.outputDir`:

- `index.md`: question router.
- `overview.md`: purpose, architecture, components, and main journeys.
- `setup.md`: commands, environments, variable names, and operational conventions.
- `decisions.md`: rules, contracts, risks, debt, or coupling that affect technical choices.
- `integrations.md`: external systems and observable private dependencies.
- `units/_map.md`: a compact table of relevant units, their purpose, entry point, and dossier when present.
- `unknowns.md`: evidence limits.
- `inventory.md`: covered directories or globs.

## 2. Focused dossiers

Select zero to three units in this order: critical business flow, component boundary,
external integration, configuration-borne rule, or change risk. Create
`units/<unit>.md` from the **same global pack** with the dossier template; do not run another
command to refine its context. If the global pack does not establish enough evidence, omit
the dossier and record the evidence limit in `unknowns.md`.

A dossier is not a transcript: it describes responsibilities, flow, rules, and key paths.
When it exceeds `readBudgetTokens`, keep only facts that answer cross-cutting questions;
do not split it or create child documents.

## 3. Close and update

Run `ancleto discovery --check` once more and apply `validation-checklist.md`. This is a
state-only validation; it must not be followed by another Repomix command. For stale nodes,
regenerate only the affected documents using one new global generation on a later request:
when the check report lists `affectedDocs`, those are the only documents to rewrite.
If a unit has no dossier, update its row in `units/_map.md` and only the root documents whose
content changed.

After any generation, write `seed-map.json` in `config.outputDir` mapping every seed document
to the source areas (first-level directories or root file names) it draws evidence from, so a
later `--check` can scope the next regeneration.
