# Design: Soporte de GitHub Copilot (VS Code y Visual Studio)

## Approach

Tratar a Copilot como un agente más del CLI, con dos diferencias asumidas respecto a
opencode: (1) los agentes se distribuyen como prompt files `.prompt.md` en
`.github/prompts/` en lugar de skills + `agents/*.md` con `model:`; (2) la
configuración MCP vive en `copilot-mcp.json` en lugar de `opencode.json`. El contenido
de los prompts se genera desde `agents/*.md` y `commands/*.md` (fuente de verdad) en
cada `install`/`upgrade`, así no hay doble mantenimiento. Los tiers no se traducen a
modelos (Copilot no lo permite): el prompt del orchestrator pide al usuario elegir el
modelo en el picker y describe el tier como nivel de esfuerzo/pasos.

Decisiones de diseño:
- `SUPPORTED_AGENTS` suma `'copilot'`; el wizard y `--agent copilot` lo aceptan y se persiste en `.ancletorc` (`agent: copilot`).
- `AGENT_SKILLS_DIR['copilot'] = '.github/prompts'`; `--project` instala ahí, `--global` no aplica (los prompts son por repo).
- `applyTier` no toca `.github/prompts` (sin `model:` que reescribir); como alternativa, el orchestrator de Copilot incluye la tabla de esfuerzo por tier.
- `upgrade --agent copilot` regenera prompts sin pisar `copilot-instructions.md` con contenido custom (merge por existencia, igual criterio que `copilot-instructions.md` custom).

## Architecture

```text
src/cli/index.js
├── SUPPORTED_AGENTS += 'copilot'
├── AGENT_SKILLS_DIR['copilot'] = '.github/prompts'
├── installAgentSkills(projectDir, 'copilot')
│   ├── agents/*.md + commands/*.md → .github/prompts/<nombre>.prompt.md
│   │   (frontmatter → nombre del prompt; instrucciones idénticas)
│   └── comandos /cleto-* y /opsx-* como prompts invocables
├── mergeMcp() → copilot-mcp.json (mismo merge no destructivo)
└── upgrade → regenera prompts, preserva copilot-instructions.md custom

.github/prompts/
├── orchestrator.prompt.md   # triage y delegación (pide modelo en el picker)
├── coder.prompt.md, tester.prompt.md, reviewer.prompt.md, spec-writer.prompt.md, ...
└── cleto-*.prompt.md        # comandos como prompts
```

Conversión `agents/*.md` → `.prompt.md`: se conserva el cuerpo markdown completo; el
frontmatter `name`/`description` define el nombre del prompt. Los comandos
`commands/*.md` (`/cleto-*`) se convierten con el mismo procedimiento para que el
flujo SDD completo esté disponible en Copilot.

## Validation

- Tests con fixture: `install --agent copilot` crea `.github/prompts/*.prompt.md` y `copilot-mcp.json` con `ancleto-memory`/`engram`/`caveman` y rutas válidas del host.
- `upgrade --agent copilot` regenera sin truncar `copilot-instructions.md` custom.
- Verificación manual documentada: en VS Code (extensión GitHub Copilot) y en Visual Studio 2022+ aparecen los agentes y el MCP responde.
- La guía del repo aclara que el tier no cambia modelos en Copilot.
