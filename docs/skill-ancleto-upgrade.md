# Skill ancleto-upgrade

## Introducción

`ancleto-upgrade` es un skill que automatiza migraciones de dependencias major en tu
repositorio:

- De cualquier librería npm, runtime o framework (Node.js, TypeScript, React, Middy, etc.).
- Analiza TODO el repo (source, tests, config, CI/CD, Docker).
- Descarga documentación oficial de la librería (o acepta una URL provista).
- Detecta automáticamente qué hay que cambiar.
- Crea un plan estructurado en OpenSpec (no toca código).
- Deja todo listo para aplicar cambios sistemáticamente.

**Diferencia clave**: no es un script que aplica sed/regex ciegamente. El análisis es
completamente dinámico — detecta la versión actual en el repo, obtiene los breaking
changes de la documentación oficial, construye los patterns de búsqueda a partir de eso
y escanea todo el código. Sin listas estáticas.

## ¿Cómo funciona el flujo de Upgrade?

Cuando ejecutas un comando de upgrade, el asistente de IA sigue un pipeline de ingeniería
estricto en 8 pasos:

1. **Parsear argumentos** — extrae `LIBRARY`, `TARGET_VERSION`, `DOCS_URL` (opcional) y
   deriva `CHANGE_NAME` (ej. `node22-migration`).
2. **Detectar versión actual en el repo** — busca en `.nvmrc`, `engines`, Dockerfiles,
   CI/CD y package.json para inferir `CURRENT_VERSION`.
3. **Obtener breaking changes de la documentación** — prioriza URL del usuario → docs
   oficiales → release notes → changelog; construye `SEARCH_PATTERNS[]` y `VERSION_PATTERNS[]`.
4. **Escanear el repo** — grep exhaustivo (versión + breaking changes) por categoría:
   package.json, monorepo, CI/CD, runtime, Docker, CDK, configs, source y tests.
5. **Clasificar hallazgos** — `BREAKING_CHANGES_IN_CODE[]`, `IN_TESTS[]`,
   `CONFIG_CHANGES[]`, `DEPENDENCY_CHANGES[]`, `UNSURE_MATCHES[]`, con confianza
   `high|medium|low`.
6. **Crear el change OpenSpec** — `openspec new change`.
7. **Escribir los artefactos** — `proposal.md`, `specs/`, `tasks.md`, `design.md`.
8. **Mostrar resumen final** — cobertura del escaneo, patterns usados, breaking changes.

## Ejemplos de Invocación

```text
/ancleto-upgrade node 22                  → migra Node.js a v22
/ancleto-upgrade @middy/core 7            → migra Middy a v7
/ancleto-upgrade @middy/core 7 https://middy.js.org/docs/upgrade/v7   → con docs provistas
/ancleto-upgrade react 19                 → migra React a v19
/ancleto-upgrade typescript 5.8           → migra TypeScript a 5.8
```

## ¿Qué hace exactamente tras ejecutarse?

El skill genera automáticamente un Change OpenSpec dentro de
`openspec/changes/{LIBRARIA}-migration/`. Estos artefactos contienen todo lo necesario
para escalar el esfuerzo de la migración:

1. **proposal.md** — qué, por qué y cómo vamos a migrar, versiones y dependencias afectadas.
2. **tasks.md** — checklist faseado (6 fases) detallando archivo por archivo qué hay que
   modificar en código, tests y configuraciones.
3. **specs/...** — especificación técnica de la migración para la auditoría de arquitectura.
4. **design.md** — diseño y estrategia.

Una vez que el skill arroja este resultado, todo se reduce a seguir el plan. Revisá el
contenido propuesto de OpenSpec y luego invocá:

```text
/opsx-apply {nombre-del-change}
```

Esto indica al agente que empiece a modificar el código fuente basándose en los `tasks.md`.

## Guardrails (Garantías de Seguridad)

- **No produce "Breaking Changes" silenciosos**: solo investiga y documenta. No modifica
  ningún archivo del repo fuera de `openspec/changes/{CHANGE_NAME}/`.
- **Usa evidencias empíricas**: cada archivo recomendado se basa en los migration guides
  oficiales. Los `VERSION_PATTERNS[]` siempre se aplican, con o sin documentación oficial.
- **No bloquea sin URL**: si no hay doc oficial, se documenta en el proposal y se continúa
  con el escaneo por patterns de versión.
- **Reporta cobertura**: siempre muestra cuántos archivos se escanearon por categoría y
  qué patterns se usaron.

## Estructura del Change Creado

Después de ejecutar `/ancleto-upgrade node 22`, te encontrás esto:

```
openspec/changes/
└── node22-migration/
    ├── proposal.md
    │   ├── Resumen (versiones actuales vs target)
    │   ├── Archivos afectados críticos
    │   ├── Dependencias que cambian
    │   ├── Estimación de esfuerzo
    │   └── Riesgos identificados
    ├── design.md
    │   ├── Breaking Changes identificados
    │   ├── Estrategia de mitigación
    │   ├── Validaciones necesarias
    │   └── Secuencia recomendada
    ├── specs/node22.md
    │   └── Especificación técnica de la migración
    └── tasks.md
        ├── Fase 1: Dependencias (día 1)
        │   - [ ] Actualizar .nvmrc
        │   - [ ] Actualizar package.json engines
        │   - [ ] Actualizar Dockerfile
        │   - [ ] Commit
        ├── Fase 2: Código (día 2-3)
        │   - [ ] Revisar src/crypto/ por scryptSync
        │   - [ ] Actualizar src/loaders/
        │   - [ ] Tests
        └── Fase 6: Validación (día 4)
            - [ ] npm test
            - [ ] npm run build
            - [ ] CI/CD verde
```