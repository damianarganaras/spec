# Product Context - [Product Name]

> **This file is EXTENSIBLE and will never be replaced by @ancleto/spec**
>
> Fill in the sections according to your product/project. AI agents read this file to understand product-specific context.

## Project Type

- _Describe: Web App, REST API, Library, Monorepo, etc._

---

## Tech Stack

- **Runtime**: Node.js >=24.x
- **Language**: TypeScript
- **Framework**: _(e.g., Next.js / Express / React / NestJS)_
- **Testing**: _(e.g., Node Test Runner / Vitest / Jest)_
- **Infra / CI/CD**: _(e.g., GitHub Actions / AWS / Docker)_

---

## AI Memory (.ancleto/memory.db)

- **Repository App ID**: ancleto.[Product Name]
- **Scope**: `project:[Product Name]`

> Memory for this repository is persisted locally in `.ancleto/memory.db` (SQLite + FTS5).
> Agents store architectural decisions and rules here automatically. It never leaves the repo.
> Consult via the `searchMemory` tool when modifying prior decisions, after a
> `<ContextOverflowWarning>`, or before major refactors / contract changes.

---

## Azure DevOps (Optional)

_Fill in ONLY if this project uses Azure DevOps for Work Items._

- **Organization URL**: https://dev.azure.com/your-org
- **Team Project**: YourProject

**Work item fetch command (single-line CLI execution):**

```bash
ORG=$(grep -Eim1 '\*\*(Organization URL|Organization)\*\*:' PRODUCT.md | grep -oE 'https?://[^ `"]+') && \
az boards work-item show --id <id> --org "$ORG" --expand none --fields System.Id,System.Title,System.WorkItemType,System.TeamProject,System.State,System.Description,Microsoft.VSTS.Common.AcceptanceCriteria \
 | sed 's/\\r\\n/\n/g; s/\\n/\n/g; s/<[^>]*>//g; s/&nbsp;/ /g; s/&quot;/"/g; s/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' \
 | fold -s -w 200
```

- **Required inputs**: `id` + `org` (leído del campo `Organization URL` por `grep`). No pasar
  `--project` (falla).
- `--expand none --fields` es obligatorio (el default `--expand all` trae el work item completo).
- `sed` + `fold` no son cosméticos: `System.Description` llega en una sola línea HTML de hasta
  70k chars y el runtime trunca a 2k sin ellos.
- Setup: `az extension add --name azure-devops`; alcanza con `az login`.

---

## Project Structure

```text
src/
  components/
  features/
  services/
aspec/
  config.yaml
  changes/
```

---

## Critical Files & Guardrails

**Take special care when modifying:**

- Core business logic in `src/core/`
- Infrastructure definitions & Environment variables

**Avoid:**

- Uncommunicated breaking changes in public APIs
- Adding external dependencies without checking existing ones

---

## Project Commands

- `npm run dev` → Development server
- `npm test` → Run tests
- `npm run build` → Production build
- `npm run lint` → Linter

<!-- LOCKED: test-block -->
Contexto gestionado por @ancleto/spec — no editar: se re-aplica en cada actualizacion.
<!-- /LOCKED: test-block -->
