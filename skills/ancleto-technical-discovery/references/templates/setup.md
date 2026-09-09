# Setup template

`setup.md` records only the operational information needed to run, test, and orient within
the repository. The generated document must use Spanish and never copy secret values.

```markdown
---
node: setup
kind: setup
read_when: preparar el entorno o ejecutar los comandos principales
generatedAt: <ISO timestamp>
pluginVersion: <version from report>
skillVersion: '2.3'
---

# Setup

## Comandos principales

| Objetivo | Comando | Fuente |
| --- | --- | --- |
| <objetivo> | `<comando>` | `<path>` |

## Entornos y variables

<Nombre de variable, propósito y path de referencia; nunca su valor.>
```
