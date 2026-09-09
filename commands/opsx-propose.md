---
description: Propose a new change - create it and generate all artifacts in one step
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:

- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

When ready to implement, run /opsx-apply

---

**Input**: The argument after `/opsx-propose` is the change name (kebab-case), OR a description of what the user wants to build.

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

   WI context is held **in-memory** for this flow — no `context.md` is written.

   **IMPORTANT**: Do NOT proceed without a change name.

2. **Fetch Knowledge Base context** (if KB MCP is available)

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

3. **Create the change directory**

   ```bash
   openspec new change "<name>"
   ```

   This creates a scaffolded change at `openspec/changes/<name>/` with `.openspec.yaml`.

4. **Get the artifact build order**

   ```bash
   openspec status --change "<name>" --json
   ```

   Parse the JSON to get:

   - `applyRequires`: array of artifact IDs needed before implementation (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts with their status and dependencies

5. **Create artifacts in sequence until apply-ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:

   - Get instructions:
     ```bash
     openspec instructions <artifact-id> --change "<name>" --json
     ```
   - The instructions JSON includes:
     - `context`: Project background (constraints for you - do NOT include in output)
     - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
     - `template`: The structure to use for your output file
     - `instruction`: Schema-specific guidance for this artifact type
     - `outputPath`: Where to write the artifact
     - `dependencies`: Completed artifacts to read for context
   - Read any completed dependency files for context
   - If creating the first artifact (proposal):
     - If WI context is available (in-memory): use WI title/description as the problem statement, acceptance criteria as the requirements basis, and include a `## Related Work Item` section: `**#{id}** — {System.Title} ({WorkItemType}) · Project: {System.TeamProject}`
     - If `kb-context.md` exists for this change: read it and use its contents as organizational context when writing the artifact (do NOT copy kb-context.md content into the output)
   - Create the artifact file using `template` as the structure
   - Apply `context` and `rules` as constraints - but do NOT copy them into the file
   - Show brief progress: "✓ Created <artifact-id>"

   b. **Continue until all `applyRequires` artifacts are complete**

   - After creating each artifact, re-run `openspec status --change "<name>" --json`
   - Check if every artifact ID in `applyRequires` has `status: "done"` in the artifacts array
   - Stop when all `applyRequires` artifacts are done

   c. **If an artifact requires user input** (unclear context):

   - Use **AskUserQuestion tool** to clarify
   - Then continue with creation

6. **Show final status**
   ```bash
   openspec status --change "<name>"
   ```

**Output**

After completing all artifacts, summarize:

- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx-apply` to start implementing."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openspec instructions` for each artifact type
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**Guardrails**

- Create ALL artifacts needed for implementation (as defined by schema's `apply.requires`)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
