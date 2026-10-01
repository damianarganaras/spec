# Design: Fix del directorio de skills de Antigravity (+ garantía IDE/CLI)

## Approach

Cambio mínimo y reversible en el mapeo de instalación: `AGENT_SKILLS_DIR.antigravity`
pasa de `.antigravity/skills` a `.agents/skills` (ruta que Antigravity escanea según
la documentación oficial), con copia adicional a `.agent/skills` solo si no existe
(compatibilidad retro) y destino global `~/.gemini/antigravity/skills` para
`install --global`. Antes de declarar soporte, se verifica si Antigravity espera
además agentes en rutas propias (`.antigravity/agents`, `.greenclay/...`): si existe
tal expectativa, se mapea también; si no, se documenta que no aplica. El criterio de
salida es evidencia en dos entornos: las skills `ancleto-*` deben descubrirse en
Antigravity IDE y en Antigravity CLI con frontmatter sin warnings.

Decisiones de diseño:
- No se cambia el nombre del agente (`antigravity`) ni el formato `SKILL.md` (ya estándar).
- La copia retro `.agent/skills` es solo fallback: si el directorio ya existe con contenido, no se toca.
- `install --global` con agente antigravity respeta XDG/destino global documentado (`~/.gemini/antigravity/skills`).
- La verificación post-instalación queda como paso documentado (listar skills `@skill`/`/skill` y confirmar `ancleto-*`), ejecutable en ambos entornos.

## Architecture

```text
src/cli/index.js
└── AGENT_SKILLS_DIR.antigravity = '.agents/skills'   # antes '.antigravity/skills'

install --agent antigravity [--project]
├── skills → <proyecto>/.agents/skills/<skill>/SKILL.md
├── fallback → <proyecto>/.agent/skills/... (solo si no existe)
└── (verificar: agentes en .antigravity/agents o .greenclay/... si aplica)

install --global --agent antigravity
└── skills → ~/.gemini/antigravity/skills/<skill>/SKILL.md

verificación (IDE y CLI)
└── listar skills → ancleto-new/propose/apply/... presentes, sin warnings de frontmatter
```

## Validation

- Tests con fixture: `install --agent antigravity` deja skills en `.agents/skills/` (y `.agent/skills/` cuando corresponde); ningún archivo en `.antigravity/skills`.
- `install --global` con antigravity usa el destino global (testeable con `XDG_CONFIG_HOME`/HOME temporal).
- Frontmatter `name`/`description` de cada skill parsea sin warnings (test de contrato sobre `skills/*/SKILL.md`).
- Evidencia manual en IDE y CLI registrada en la doc; solo entonces se declara soporte garantizado y se cierra el item de BACKLOG.
