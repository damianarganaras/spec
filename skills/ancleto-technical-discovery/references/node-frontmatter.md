# Seed frontmatter

Every generated document declares its purpose and provenance in YAML. Reader-facing values,
including `read_when`, must be written in Spanish.

| Field | Required | Purpose |
| --- | --- | --- |
| `node` | yes | Relative identifier within the seed. |
| `kind` | yes | `router`, `overview`, `setup`, `decisions`, `integrations`, `inventory`, `unknowns`, or `dossier`. |
| `read_when` | yes | Question class answered by the document, in Spanish. |
| `sources` | dossiers only | Globs for relevant sources. |
| `sourcesSha` | dossiers only | CLI-computed hash for those globs. |
| `generatedAt` | yes | Generation timestamp. |
| `pluginVersion` | yes | Plugin version reported by the CLI. |
| `skillVersion` | yes | This skill version. |

The generated dossier frontmatter must follow this Spanish example:

```yaml
---
node: units/pagos
kind: dossier
read_when: preguntas sobre el cobro y sus reglas
sources: ["apps/api/pagos/**", "libs/pagos/**"]
sourcesSha: <hash>
generatedAt: <ISO timestamp>
pluginVersion: <version>
skillVersion: '2.3'
---
```
