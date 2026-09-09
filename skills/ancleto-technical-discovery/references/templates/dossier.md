# Focused dossier template

Use only for one of up to three high-impact units. Instructions are in English, but the
generated document must use the following Spanish structure and Spanish prose.

```markdown
---
node: units/<unidad>
kind: dossier
read_when: preguntas sobre <flujo, regla o integración>
covers: [<temas>]
sources: ["<globs>"]
sourcesSha: <hash from CLI>
generatedAt: <ISO timestamp>
pluginVersion: <version from report>
skillVersion: '2.3'
---

# <Unidad>

## Propósito

<Qué resuelve y por qué importa.>

## Recorrido relevante

<Entrada → transformación → salida, con paths clave.>

## Reglas, contratos y riesgos

<Solo los hallazgos que afectan decisiones o cambios.>

## Paths clave

| Path | Rol |
| --- | --- |
| `<path>` | <rol verificable> |
```
