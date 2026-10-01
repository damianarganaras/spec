# Instalación manual (sin npm)

Esta guía cubre la **opción A**: usar ancleto sin pasar por npm, ejecutando el CLI directamente desde el código fuente con `node`. Sirve cuando npm está bloqueado por políticas, no está instalado, o preferís no instalar paquetes globales.

> Funciona porque el paquete tiene **cero dependencias de runtime** y el binario es un script Node con shebang (`src/cli/index.js`). Con Node ≥ 24 alcanza; no hay `npm install` que correr porque no hay nada que instalar.

## 1. Requisitos

| Requisito | Detalle |
|---|---|
| **Node.js ≥ 24.0.0** | Obligatorio: el motor de memoria usa el módulo nativo `node:sqlite`. Verificá con `node --version`. |
| **git** | Para clonar el repo (o podés descargar el `.zip` del release desde GitHub). |
| **Repomix** | Opcional: se resuelve vía `npx` cuando no está instalado. |

## 2. Obtener el código

```bash
git clone https://github.com/damianarganaras/spec.git
cd spec
node --version   # debe ser >= 24
```

Sin git: descargá el `.zip` del tag que quieras desde la página de releases y descomprimilo. El directorio donde quede (acá `spec/`) es la **fuente de instalación**: no lo borres, el CLI se ejecuta desde ahí.

## 3. Instalación en un proyecto

La forma general (reemplazá `/tu/proyecto` por tu repo):

```bash
node src/cli/index.js install --project /tu/proyecto --agent <host> --tier minimo --no-mcp
```

Flags útiles:

| Flag | Efecto |
|---|---|
| `--agent <host>` | Layout nativo a materializar (ver tabla abajo). Si lo omitís, pregunta interactivamente. |
| `--tier normal\|minimo\|gratis` | Modelos y presupuesto de contexto. `minimo` es el default razonable. |
| `--no-mcp` | No toca la configuración MCP de tu IDE. Recomendado para la primera prueba. |
| `--with-engram` | Suma el MCP externo engram (18 herramientas, ~4.900 tokens por request). Off por defecto. |
| `--profile test` | Perfil de test automation (Playwright). Solo si lo necesitás. |
| `--lang es` | Idioma de los artifacts (`auto` detecta de la conversación). |

Verificá después con:

```bash
node src/cli/index.js check   # desde /tu/proyecto → 0 faltantes, 0 huérfanos
```

Para actualizar a una versión nueva del framework: `git pull` en `spec/` y luego `node src/cli/index.js upgrade` desde tu proyecto (conserva tus personalizaciones).

> Sin `--agent` el instalador pregunta interactivamente (IDE + tier + idioma). En scripts o CI pasá todos los flags para modo no interactivo.

## 4. Por host

Corré los comandos desde el directorio `spec/` clonado. Todos escriben en `/tu/proyecto` sin tocar nada global.

### opencode (default)

```bash
node src/cli/index.js install --project /tu/proyecto --agent opencode --tier minimo
```

Materializa `.opencode/skills/<n>/SKILL.md`, `.opencode/agents/<n>.md` y `.opencode/commands/<n>.md`. Es el layout completo: skills, agentes y comandos `/cleto-*`. MCP de memoria propia (`ancleto-memory`) salvo `--no-mcp`.

### vscode (VS Code)

```bash
node src/cli/index.js install --project /tu/proyecto --agent vscode --tier minimo
```

Materializa `.github/skills/`, `.github/agents/<n>.agent.md` y `.github/prompts/<n>.prompt.md`. Los agents llevan frontmatter adaptado (se quitan claves propias de opencode). El MCP de VS Code (`.vscode/mcp.json`) **no** lo gestiona el CLI.

### copilot (VS Code / Visual Studio con Copilot)

```bash
node src/cli/index.js install --project /tu/proyecto --agent copilot --tier minimo
```

> No existe un host `visual-studio` separado: para Visual Studio (el IDE) se usa el host `copilot`, cuyos prompts funcionan donde Copilot funcione.

Instala agents y commands como prompt files en `.github/prompts/*.prompt.md` y el MCP en `copilot-mcp.json` (merge no destructivo, nunca toca tu `copilot-instructions.md`). El modelo lo elegís en el picker de Copilot: el tier solo marca el nivel de esfuerzo. Este host no tiene skills.

### antigravity

```bash
node src/cli/index.js install --project /tu/proyecto --agent antigravity --tier minimo
```

Escribe skills en `.agents/skills/` y agents adaptados en `.agents/agents/` (frontmatter convertido al formato del host: `tools` como lista de ids verificados, `model: inherit`). No tiene directorio de commands: los `/cleto-*` se materializan como **command-skills** en `.agents/skills/<n>/SKILL.md`. Genera o mergea el MCP de workspace `.agents/mcp_config.json` incluyendo el servidor de memoria.

### claude

```bash
node src/cli/index.js install --project /tu/proyecto --agent claude --tier minimo
```

Layout en `.claude/skills/`, `.claude/agents/` y `.claude/commands/` con adaptación de frontmatter obligatoria. Sin MCP propio gestionado.

### cursor / roo (solo skills)

```bash
node src/cli/index.js install --project /tu/proyecto --agent cursor --tier minimo
```

Solo se instalan skills (`.cursor/skills/` o `.roo/skills/`); agents y commands no están soportados por estos hosts y el instalador los omite con un aviso (no es un error).

## 5. Uso global sin npm (opcional)

Si querés el comando `ancleto` disponible en todos tus proyectos sin `npm install -g`, creá un alias o symlink al script (tiene shebang y no necesita build):

```bash
ln -s /ruta/a/spec/src/cli/index.js ~/.local/bin/ancleto
ancleto install --project /tu/proyecto --agent opencode --tier minimo
```

Asegurate de que `~/.local/bin` esté en tu `PATH` y de tener permiso de ejecución (`chmod +x src/cli/index.js`).

## 6. Qué NO obtenés sin npm

- **Auto-update del paquete**: con npm es `npm update -g`; manual es `git pull` en `spec/`.
- **Resolución por `PATH` del binario**: la ponés vos con el symlink de arriba.
- Nada más: templates, skills, memoria, discovery y tiers funcionan idéntico, porque el CLI es el mismo código.
