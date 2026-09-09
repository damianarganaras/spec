# Scope inventory template

`inventory.md` provides coverage orientation, not a file list. Instructions are in English;
the generated document and its table values must be in Spanish.

```markdown
---
node: inventory
kind: inventory
read_when: verificar el alcance documentado de la semilla
generatedAt: <ISO timestamp>
pluginVersion: <version from report>
skillVersion: '2.3'
---

# Alcance documentado

| Alcance | Documento | Motivo |
| --- | --- | --- |
| `apps/**` | `overview.md` | Entrypoints y composición principal |
| `libs/pagos/**` | `units/pagos.md` | Flujo comercial crítico |
```
