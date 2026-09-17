# Guía de configuración del entorno de IA (ancleto)

## Objetivo

Esta guía describe los pasos para configurar el toolkit de IA de `@ancleto/spec` en una
máquina nueva: instalación del CLI, configuración de los MCP de opencode, elección del
nivel de costo, inicialización de un proyecto y validación final.

## Prerrequisitos

Antes de comenzar, debes tener:

- **Node.js >= 24.0.0** (el motor de memoria v0.2.0 usa el módulo nativo `node:sqlite`).
- **opencode** instalado (cliente soportado del framework).
- **openspec CLI** (`npm i -g @openspec/cli`) para el ciclo de changes.
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
- **Commands (12)** `opsx-*` para el ciclo de changes OpenSpec.
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
- Agents/commands/skills disponibles en opencode (`/opsx-new`, etc.).
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