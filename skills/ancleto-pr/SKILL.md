---
name: ancleto-pr
description: Create pull request following conventional commits (semantic title, detailed description, test plan). Azure DevOps si esta habilitado, GitHub por defecto
license: MIT
compatibility: Requires az repos (si azure.enabled) o gh CLI
metadata:
  author: ancleto
  version: '1.0'
  category: git-workflow
---

Create a pull request following semantic standards.

**Azure is optional**: if `.ancletorc` does not declare `azure.enabled: true`, use the GitHub flow (`gh pr create`, see "Alternative: GitHub PRs" below). The Azure DevOps flow applies only when it is enabled.

**When to use**: User wants to create a PR for their current branch.

**Steps**

1. **Validate branch state**

   ```bash
   git rev-parse --abbrev-ref HEAD
   git status
   ```

   **Checks:**

   - ❌ Protected branch (main, master, develop, qa, sandbox): error and stop
   - ⚠️ Uncommitted changes: warn and suggest committing first
   - ✅ Clean: proceed

2. **Check remote tracking**

   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
   ```

   If no upstream tracking: suggest `git push -u origin <branch-name>` and ask whether to push now or manually.

3. **Determine base branch**

   Ask the user (use the runtime question tool when available):

   - "What branch should this PR merge into?"
     - Option 1: "main" (Recommended for most features)
     - Option 2: "develop" (if using gitflow)
     - Option 3: "Other (specify)"

4. **Analyze all changes in the PR**

   ```bash
   git log <base-branch>..HEAD --oneline
   git diff <base-branch>...HEAD --stat
   ```

   Review ALL commits included, not just the latest.

5. **Generate PR title and description**

   **Title format:** `type: Short description (<70 chars)` — same types as commits (feat, fix, chore, docs, etc.); keep concise, details go in the description.

   **Description format:**

   ```markdown
   ## Summary

   - Main change 1
   - Main change 2

   ## Technical Details

   - Key implementation decisions
   - Architecture changes (if any)
   - Dependencies added/updated (if any)

   ## Test Plan

   - [ ] Unit tests pass (`npm test`)
   - [ ] Integration tests pass (if applicable)
   - [ ] Manual testing performed
   - [ ] Tested on [environment/browser/device]
   - [ ] Edge cases covered

   ## Breaking Changes

   _None_ OR _List breaking changes and migration steps_

   ## Related Issues

   - Closes #123 (if applicable)
   - Related to #456 (if applicable)

   ---

   🤖 Generated with [OpenCode](https://opencode.ai)
   ```

6. **Show PR command before executing**

   Display the exact `az repos pr create` command:

   ```bash
   az repos pr create \
     --title "feat: add user authentication" \
     --description "$(cat <<'EOF'
   ## Summary
   ...

   🤖 Generated with OpenCode
   EOF
   )" \
     --source-branch <current-branch> \
     --target-branch <base-branch>
   ```

   Use heredoc for description to ensure proper formatting.

7. **Create PR**

   After user confirmation, execute the command.

   **On success:** show the PR URL and suggest next steps (request reviewers, link work items, etc.).

   **On error:** "az not found" → install Azure CLI and authenticate; "not authenticated" → run `az login`; other → show the error and suggest manual PR creation.

**Guardrails**

- ❌ NEVER create PR from protected branches
- ❌ NEVER force push before creating PR
- ⚠️ Warn if uncommitted changes exist
- ✅ Always analyze ALL commits in the branch, not just the latest
- ✅ Include test plan checklist
- ✅ Use heredoc for multi-line description
- ✅ Add "Generated with OpenCode" footer

**Alternative: GitHub PRs**

If using GitHub instead of Azure DevOps, use `gh pr create`:

```bash
gh pr create \
  --title "feat: add user authentication" \
  --body "$(cat <<'EOF'
...
EOF
)"
```

**Related Documentation**

- See `AGENTS.md` for commit and PR conventions
