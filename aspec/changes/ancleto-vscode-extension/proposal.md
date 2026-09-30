# Proposal: Extensión de VS Code para ancleto

## Problem

Hoy `ancleto` se distribuye e instala únicamente vía npm (`@ancleto/spec` con binarios `ancleto` y `aspec`). En entornos donde npm no está disponible, está bloqueado por políticas, o el usuario prefiere el flujo nativo de VS Code (Marketplace, instalación en 1 clic, auto-update), no hay vía de adopción. Los usuarios piden poder instalarlo con npm cuando sea posible, pero tener también un plugin de VS Code que haga lo mismo.

## Proposed change

Planificar la distribución de `ancleto` como extensión de VS Code que conserve paridad funcional con la CLI npm, sin romper el contrato actual (cero dependencias de runtime, Node ≥ 24). El código publicado en npm es la única fuente de verdad: un build transforma ese mismo código al formato `.vsix`, para que cada cambio nuevo se deploye rápido sin doble mantenimiento. El deploy a Marketplace se hace desde GitHub (Actions) en el mismo flujo que el publish a npm. Esta fase es **solo planning**: definir estrategia de empaquetado, arquitectura de la extensión, pipeline de transformación npm → vsix, modelo de distribución dual (npm + VS Marketplace / Open VSX), y plan de implementación por fases. No se implementa código en este change.

## Scope

In scope:
- Estrategia dual de distribución: npm (actual, fuente de verdad) + VS Code Marketplace (nuevo, derivado por build), con versionado único.
- Pipeline de transformación npm → `.vsix`: script de build que convierte/copia el código npm al layout que usa la extensión, para deploys rápidos ante cada cambio.
- Deploy desde GitHub al Marketplace: workflow en `.github/workflows/` que publica a VS Marketplace y Open VSX en paralelo al publish npm, solo en tags `v*`.
- Definición de superficie funcional de la extensión (equivalencia con `ancleto install`, `update`, `/cleto-*`, memoria, MCP, discovery).
- Análisis de opciones de empaquetado (bundling de `agents/`, `commands/`, `skills/`, `templates/`, `src/` dentro del `.vsix`).
- Requisitos de marketplace (publisher, licenciamiento MIT, README, icon, categorías, Node runtime en host VS Code).
- Plan de validación y fases de implementación futura.

Out of scope:
- Implementación de la extensión (`package.json` de extensión, `extension.ts`, `.vsix`, pipeline de publish).
- Cambios en la CLI actual o en contratos de memoria/templates.
- Soporte para otros IDEs (Cursor, Roo, OpenCode) más allá de la compatibilidad existente vía CLI.
- Publicación real en Marketplace / Open VSX.

## Risks

- Duplicación de superficie de mantenimiento (CLI npm + extensión): mitigación con núcleo compartido y build que reutiliza `src/` y assets sin fork.
- Ruptura del contrato zero-dependencies: mitigación prohibiendo dependencias de runtime en la extensión y auditando `vsce package`.
- Requisito Node ≥ 24 no garantizado en host VS Code: mitigación detectando versión al activar y degradando con mensaje claro.
- Sobrecosto de firmas, publisher y revisión de Marketplace: mitigación documentando el proceso y empezando por `vsix` local / Open VSX.
- Divergencia UX entre terminal y panel VS Code: mitigación definiendo paridad explícita de comandos en el design.
