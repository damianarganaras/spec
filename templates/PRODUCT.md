# Product Context - [Product Name]

> **This file is EXTENSIBLE and will never be replaced by @ancleto/ai-tooling-framework**
>
> Fill in the sections according to your product/project. This file is read by AI agents (Claude, Cursor, etc.) to understand the specific context of your product.

> **How to complete this file:** replace `[Product Name]` in the title and fill each section with your product's real values, deleting the example/placeholder text as you go. At a minimum, complete **Project Type**, **Tech Stack**, **Azure DevOps**, **AI Memory**, **Project Structure**, and **Project Commands** — agents rely on these to operate in your repo. The remaining sections are optional but recommended.

## Project Type

_Describe the project type: Web App, API, Library, Monorepo, etc._

**Example:**

- Web application with SSR
- REST API with Node.js
- Shared TypeScript library
- Nx/Lerna monorepo

---

## Tech Stack

_List the project's main technologies._

**Base stack:**

- **Runtime**: Node.js 20.x
- **Language**: TypeScript
- **Build**: Nx / Webpack / Vite (depending on the project)
- **Testing**: Jest + Testing Library
- **CI/CD**: Azure DevOps

**Additional per project:**

- Framework: React / Vue / Angular / Express
- State: Redux / Context / Zustand
- Styling: TailwindCSS / Sass / CSS-in-JS
- Infra: AWS CDK / Serverless / Containers

---

## Azure DevOps

_How this project retrieves work items and other Azure DevOps resources. AI agents read this to resolve cards._

**Fill in for your project:**

- **Organization URL**: https://dev.azure.com/your-org
- **Team Project**: YourProject

Keep the `Organization URL` value as a plain URL, on a line containing the words `Organization URL` — the fetch command below reads it from here with a `grep`.

**Work items (card fetch):** via the `az` CLI (`azure-devops` extension), in a single call:

```bash
ORG=$(grep -Eim1 '\*\*(Organization URL|Organization)\*\*:' PRODUCT.md | grep -oE 'https?://[^ `"]+') && \
az boards work-item show --id <id> --org "$ORG" --expand none --fields System.Id,System.Title,System.WorkItemType,System.TeamProject,System.State,System.Description,Microsoft.VSTS.Common.AcceptanceCriteria \
 | sed 's/\\r\\n/\n/g; s/\\n/\n/g; s/<[^>]*>//g; s/&nbsp;/ /g; s/&quot;/"/g; s/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' \
 | fold -s -w 200
```

- **Required inputs**: `id` (card number) + `org`. Do NOT pass `--project` — it fails with `unrecognized arguments: --project`; the id is org-global and the project comes back as `System.TeamProject`.
- **The organization is read from this file by the shell**, from the `Organization URL` line above — one substitution inside the same call, instead of an agent reading this whole file into its context.
- **Always project with `--expand none --fields`**: the CLI defaults to `--expand all` and returns the entire work item. `--fields` without `--expand none` fails with `The expand parameter can not be used with the fields parameter`.
- **`sed` + `fold` are not cosmetic**: `System.Description` arrives as a single HTML line that can exceed 70.000 characters, and the agent runtime truncates long lines at 2.000 — without them the agent silently receives a fraction of the description.
- **Response fields used** (`.fields`): `System.Id`, `System.Title`, `System.Description`, `Microsoft.VSTS.Common.AcceptanceCriteria`, `System.WorkItemType`, `System.TeamProject`, `System.State`.
- **Setup/auth**: requires `az extension add --name azure-devops`; `az login` (AAD) is enough — a PAT (`AZURE_DEVOPS_EXT_PAT`) only as a fallback.

## AI Memory

- **Repository App ID**: ancleto.YourProject

`Repository App ID` identifies this repository in the shared mem0 store. Agents use it to isolate memories from other repositories. It must be unique to this repository, not shared across the Azure DevOps team project.

`Team Project` from the Azure DevOps section is stored as `project_id` in mem0. Complete both `Repository App ID` and `Team Project` before using AI memory.

---

## Project Structure

_Describe the project's main folder structure._

**Example for a monorepo:**

```
libs/                    # Shared libraries
apps/                    # Applications
tools/                   # Build tools
openspec/               # OpenSpec configuration
  config.yaml           # Project context
  changes/              # Active changes
```

**Example for a standalone app:**

```
src/
  components/           # Reusable components
  features/             # Business features
  services/             # Services and APIs
  utils/                # Utilities
openspec/
  config.yaml
  changes/
```

---

## Critical Files & Guardrails

_Project-specific critical files or folders that require special care._

**Take special care when modifying:**

**Example:**

- Code in `src/core/` (affects the whole app)
- Routing configuration
- Shared assets
- Infrastructure (CDK, Terraform, etc.)

**Avoid:**

- Architecture changes without documenting them in OpenSpec
- Introducing new dependencies without reviewing existing ones
- Modifying established conventions without team consensus

---

## Project Commands

_The project's most important npm/yarn/pnpm commands._

**Example:**

- `npm run dev` → Development server
- `npm test` → Run tests
- `npm run build` → Production build
- `npm run lint` → Linter
- `npm run deploy` → Deploy (per environment)

---

## Team Guidelines

_Team-specific conventions, patterns, and guides._

**You can add:**

- Specific naming conventions
- Preferred design patterns
- Architecture guides
- Links to internal documentation
- Reference contacts

---

## Custom Commit Rules

_Project-specific commit rules (in addition to the Conventional Commits convention defined in `CONTRIBUTING.md` and `AGENTS.md`)._

**Example:**

- Use a specific scope for modules: `feat(auth):`, `fix(payments):`
- Include the ticket number in the commit: `feat(auth): add OAuth #JIRA-123`
- Team-specific breaking-change format

---

## Custom Agent Configuration

_Agent configuration specific to this project._

**Example:**

- Code style preferences
- Patterns to follow/avoid
- Custom workflows
- Specific testing rules
