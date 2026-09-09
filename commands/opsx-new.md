---
description: Start a new change using the experimental artifact workflow (OPSX)
---

Start a new change using the experimental artifact-driven approach.

**Input**: The argument after `/opsx-new` is the change name (kebab-case), OR a description of what the user wants to build.

**Steps**

1. **Resolve Work Item context and derive change name**

   Resolve Work Item context in this order — stop at the first source that yields data:

   a. **In-session context** — If WI data was already fetched in this session, use it. Proceed to name derivation below.
   b. **`context.md`** — If a change name was provided as argument and `openspec/changes/<name>/context.md` exists, read it and use its content. Proceed to name derivation.
   c. **Ask the user** — Use the **AskUserQuestion tool** to ask for the Work Item reference. Two accepted formats:

   - **ID + Project** — e.g., ID `12345` and project `MyProject`
   - **Full URL** — e.g., `https://dev.azure.com/org/MyProject/_workitems/edit/12345`

   > "Do you have an Azure DevOps Work Item for this change? Provide the Work Item ID and Azure DevOps project name (e.g., ID: `12345`, Project: `MyProject`), or paste the full Work Item URL. Skip to describe the change manually."

   **If WI provided:**

   - If URL provided: extract numeric ID (pattern: `_workitems/edit/{id}`) AND project name (pattern: `/{org}/{project}/_workitems/`)
   - Use BOTH `id` AND `project` when calling the AzDO MCP (`wit_get_work_item`) — never call with ID alone
   - Extract from the response: `System.Id`, `System.Title`, `System.Description`, `Microsoft.VSTS.Common.AcceptanceCriteria`, `System.WorkItemType`
   - Suggest a kebab-case name derived from `System.Title` (e.g., "Add payment gateway" → `add-payment-gateway`)
   - Let the user accept or modify the suggested name before proceeding

   **If skipped:**

   - Display: "No work item linked — consider linking one for traceability."
   - If no change name was provided as argument, ask what they want to build:
     > "What change do you want to work on? Describe what you want to build or fix."
   - Derive a kebab-case name from the description.

   **IMPORTANT**: Do NOT proceed without a change name.

2. **Determine the workflow schema**

   Use the default schema (omit `--schema`) unless the user explicitly requests a different workflow.

   **Use a different schema only if the user mentions:**

   - A specific schema name → use `--schema <name>`
   - "show workflows" or "what workflows" → run `openspec schemas --json` and let them choose

   **Otherwise**: Omit `--schema` to use the default.

3. **Create the change directory**

   ```bash
   openspec new change "<name>"
   ```

   Add `--schema <name>` only if the user requested a specific workflow.
   This creates a scaffolded change at `openspec/changes/<name>/` with the selected schema.

4. **Persist Work Item context to `context.md`** (only if WI was resolved in step 1)

   Write WI context to `openspec/changes/<name>/context.md`:

   ```
   # Work Item Context

   **ID**: #{id}
   **Type**: {WorkItemType}
   **Title**: {System.Title}
   **Project**: {System.TeamProject}

   ## Description
   {System.Description (HTML stripped)}

   ## Acceptance Criteria
   {Microsoft.VSTS.Common.AcceptanceCriteria (HTML stripped)}
   ```

   Skip this step if the user skipped the Work Item step.

5. **Fetch Knowledge Base context** (if KB MCP is available)

   Query the Knowledge Base MCP at three levels using the change name/description as the search topic:

   - **Organization**: engineering standards, architectural decisions, and cross-team conventions relevant to this change
   - **Squad**: Team-specific patterns, decisions, and conventions relevant to this change
   - **Project**: Repository/domain-specific knowledge relevant to this change

   Write results to `openspec/changes/<name>/kb-context.md`:

   ```markdown
   # Knowledge Base Context

   ## Organization

   {results or "No results."}

   ## Squad

   {results or "No results."}

   ## Project

   {results or "No results."}
   ```

   **If the KB MCP is unavailable, returns an error, or all three levels return no results:**

   - Display a warning: "KB context unavailable — no results were found or the MCP failed."
   - Use the **AskUserQuestion tool** to ask:
     > "The Knowledge Base returned no context for this change. Continue without KB context, or stop to investigate?"
   - If user chooses **continue**: proceed without writing `kb-context.md`
   - If user chooses **stop**: halt and display: "Change initialization paused. Resolve KB access and retry."

6. **Show the artifact status**

   ```bash
   openspec status --change "<name>"
   ```

   This shows which artifacts need to be created and which are ready (dependencies satisfied).

7. **Get instructions for the first artifact**
   The first artifact depends on the schema. Check the status output to find the first artifact with status "ready".

   ```bash
   openspec instructions <first-artifact-id> --change "<name>"
   ```

   This outputs the template and context for creating the first artifact.

8. **STOP and wait for user direction**

**Output**

After completing the steps, summarize:

- Change name and location
- Schema/workflow being used and its artifact sequence
- Current status (0/N artifacts complete)
- The template for the first artifact
- Prompt: "Ready to create the first artifact? Run `/opsx-continue` or just describe what this change is about and I'll draft it."

**Guardrails**

- Do NOT create any artifacts yet - just show the instructions
- Do NOT advance beyond showing the first artifact template
- If the name is invalid (not kebab-case), ask for a valid name
- If a change with that name already exists, suggest using `/opsx-continue` instead
- Pass --schema if using a non-default workflow
