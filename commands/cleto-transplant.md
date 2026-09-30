---
description: Move a project between machines via ancleto export/import
---

Mudá un proyecto ancleto entre máquinas sin romper el MCP local.

**En la máquina origen** (antes de copiar el proyecto), parado en su raíz:

```bash
ancleto export --tar traslado.tgz
```

Llevá el proyecto + `traslado.tgz` a la máquina destino (cualquier medio: USB, red, nube).

**En la máquina destino** (tras copiar el proyecto), parado en su raíz:

```bash
ancleto import traslado.tgz
```

Esto aplica los portables (`.ancletorc`, templates, `aspec/`, agents, commands, skills),
regenera las entradas MCP con las rutas locales y corre `ancleto doctor` al final.

Si no tenés bundle y el `opencode.json` apunta a rutas inexistentes:

```bash
ancleto import --repair
```

Nunca se exportan credenciales, tokens, `service.json`, la config global ni `memory.db`.
