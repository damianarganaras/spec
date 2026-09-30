# Guía de configuración del entorno de IA (ancleto)

## Objetivo

Esta guía describe los pasos para configurar el toolkit de IA de `@ancleto/spec` en una
máquina nueva: instalación del CLI, configuración de los MCP de opencode, elección del
nivel de costo, inicialización de un proyecto y validación final.

## Prerrequisitos

Antes de comenzar, debes tener:

- **Node.js >= 24.0.0** (el motor de memoria v0.2.0 usa el módulo nativo `node:sqlite`).
- **opencode** instalado (cliente soportado del framework).
- **Sin binarios externos**: el ciclo de changes corre con el motor propio (skills `ancleto-*`); no requiere el CLI de aspec.
- Cuenta en npm con acceso al paquete público `@ancleto/spec`.

## 1. Instalar el CLI

```bash
npm i -g @ancleto/spec
```

Verificá la instalación:

```bash
ancleto --version
aspec --version        # alias
```

## 2. Instalar el framework en opencode

```bash
ancleto install --tier normal
```

Durante el proceso se configura:

- **Agents (10)** en `~/.config/opencode/` (orchestrator, coder, tester, etc.).
- **Commands (12)** `cleto-*` para el ciclo de changes aspec.
- **Skills (7)** base y de perfil ancleto.
- **MCPs** `engram` (memoria persistente) y `caveman` (compresión) en
  `~/.config/opencode/opencode.json`, fusionándose con la config existente.

Si preferís no tocar la config MCP:

```bash
ancleto install --no-mcp
```

## 3. Elegir el nivel de costo

En la primera configuración se pregunta el nivel de gasto de los agents:

| Tier | Modelos | Uso |
| --- | --- | --- |
| `normal` | opencode-go balanceados | Default, uso diario |
| `minimo` | modelo pagado más económico viable | Ahorro |
| `gratis` | solo modelos gratuitos (ej. `opencode/big-pickle`) | Costo cero |

El nivel elegido queda guardado en `.ancleto-tier` y `ancleto update` lo re-aplica sin
volver a preguntar.

## 4. Inicializar un proyecto

```bash
cd mi-repositorio
ancleto init                 # crea .ancletorc (Azure desactivado por defecto)
```

### Azure DevOps (opcional)

```bash
ancleto init --with-azure    # escribe .ancletorc con azure.enabled: true
```

Con Azure habilitado, completar la sección `Azure DevOps` de `PRODUCT.md` (Organization
URL, Team Project) e instalar el CLI:

```bash
az extension add --name azure-devops
```

Con `azure.enabled: false` (o sin `.ancletorc`), los flujos tratan cada request como sin
Work Item y `ancleto-pr` usa GitHub.

## 5. Generar el contexto técnico inicial

```bash
ancleto discovery            # empaca el repo con Repomix y guarda estado
ancleto discovery --check    # estado del seed: READY/STALE/PARTIAL/MISSING
```

Luego, en opencode: "Usá `ancleto-technical-discovery` para analizar este repositorio".

## 6. Resumen rápido

```bash
# Instalación
npm i -g @ancleto/spec
ancleto install --tier normal

# Proyecto
cd mi-repositorio
ancleto init
ancleto discovery

# Actualización
npm i -g @ancleto/spec@latest
ancleto update
```

## 7. Validación final esperada

Al completar la configuración, deberías tener:

- `@ancleto/spec` instalado (`ancleto --version` responde).
- Agents/commands/skills disponibles en opencode (`/cleto-new`, etc.).
- MCPs `engram` y `caveman` configurados en opencode (o warnings claros si se omitieron).
- `.ancleto-tier` con el nivel elegido.
- `.ancletorc` en el proyecto (si corriste `ancleto init`).
- `docs/technical-discovery/.discovery-state.json` generado por `ancleto discovery`.
- Tests del motor de memoria en verde (si aplica al repo que lo usa):
  `node --test`.

## 8. Observaciones

- El framework es **zero-dependencies**: el CLI y el motor de memoria usan solo
  módulos nativos de Node (excepto Repomix, que se resuelve vía `npx` en `discovery`).
- La memoria es local por repositorio en `.ancleto/memory.db`; no se sube a ningún lado.
- Requisito de Node >= 24: es vinculante para quien consuma el paquete (decidido en el
  diseño congelado v0.2.0).

## 9. Perfil test vs general (test automation con Playwright)

Por defecto instalás el perfil **general** (flujo SDD completo). Si el proyecto es de
test automation con Playwright, usá el perfil **test**:

```bash
ancleto init --profile test     # o: ancleto install --project . --profile test
```

Qué cambia con `profile: test` (persistido en `.ancletorc`):

- El `tester`/`reviewer` instalados traen los 4 workflows: planning (`cleto-test-proposal`),
  generation (`cleto-test-apply`), healing (`cleto-test-heal`), coverage (`cleto-test-coverage`),
  más `cleto-test-archive`. El `tester`/`reviewer` base del paquete queda intacto.
- Se crea `testspec/specs/` + `testspec/changes/` para los deltas de testing
  (o se reusa `aspec/` si el proyecto ya lo usa).
- `AGENTS.md` suma el bloque de convenciones Playwright.
- El orchestrator rutea: cambio test-only → tester ampliado; cambio mixto → SDD general.
- Sin Playwright instalado, los workflows degradan a análisis sin ejecución y lo reportan.

Cuándo usar cada uno: **general** para desarrollo de producto con SDD; **test** cuando el
trabajo del proyecto es automatizar pruebas (el tier y el agente aplican igual en ambos).
Combinable con cualquier agente (`--profile test --agent cursor`, etc.).

## 10. GitHub Copilot (VS Code y Visual Studio)

Si trabajás con suscripción a GitHub Copilot en lugar de opencode:

```bash
ancleto install --project . --agent copilot
```

Qué instala: los agentes y comandos como prompt files en `.github/prompts/*.prompt.md`
(generados desde `agents/` y `commands/` en cada `install`/`upgrade`, sin doble
mantenimiento) y el MCP en `copilot-mcp.json` con merge no destructivo. Tu
`copilot-instructions.md` con contenido propio no se pisa nunca.

Limitación real a tener en cuenta: **en Copilot el modelo lo elegís vos en el picker**;
`--tier` no cambia modelos (no existe `model:` por agente como en opencode). El tier se
traduce a nivel de esfuerzo: `normal` = flujo completo, `minimo` = pasos agrupados y
económicos, `gratis` = modelo gratis de tu cuenta. El prompt del orchestrator te lo
recuerda al empezar. Combinable con el perfil test
(`--profile test --agent copilot`).