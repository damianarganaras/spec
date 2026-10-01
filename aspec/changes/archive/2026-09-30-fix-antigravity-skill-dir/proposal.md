# Proposal: Fix del directorio de skills de Antigravity (+ garantía IDE/CLI)

## Problem

`ancleto install --agent antigravity` copia las skills a `.antigravity/skills`
(`AGENT_SKILLS_DIR` en `src/cli/index.js:734-737`), pero Antigravity no escanea esa
ruta: las skills no aparecen en el IDE y "ancleto no funciona". La ruta real según la
documentación oficial es `<workspace>/.agents/skills/<skill>/` (con compat retro
`.agent/skills`) y global `~/.gemini/antigravity/skills/`. Además está pendiente
validar si Antigravity IDE y Antigravity CLI se comportan igual (item abierto en
BACKLOG "En curso / próximo").

## Proposed change

Corregir `AGENT_SKILLS_DIR.antigravity` a `.agents/skills`, con copia de compatibilidad
retro a `.agent/skills` y destino global `~/.gemini/antigravity/skills` para
`install --global`. Cerrar con una verificación post-instalación en IDE y CLI que
confirme que las skills `ancleto-*` aparecen y el frontmatter (`name`/`description`)
parsea sin warnings. Sin esa verificación en ambos entornos, el soporte NO se da por
garantizado.

## Scope

In scope:
- Cambio del mapeo + compat retro + destino global.
- Revisar si Antigravity espera además agentes en rutas propias antes de prometer paridad.
- Comando/paso de verificación post-instalación (IDE y CLI).
- Documentación actualizada con el directorio correcto.

Out of scope:
- Paridad funcional completa IDE vs CLI más allá del descubrimiento de skills.
- Cambios en el formato `SKILL.md` (ya cumple el estándar: folder + frontmatter con `description`).
- Otros agentes/IDEs.

## Risks

- La documentación oficial cambia las rutas escaneadas: mitigación con la copia retro y detectando cuál existe.
- CLI e IDE divergen y un solo mapeo no sirve a ambos: mitigación instalando en ambas rutas cuando sea necesario y registrando la divergencia en la doc.
- Prometer soporte sin evidencia: mitigación con el gate explícito de verificación en ambos entornos como criterio de salida.
