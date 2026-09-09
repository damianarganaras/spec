---
name: ancleto-pr
description: Create pull request in Azure DevOps following conventional commits (semantic title, detailed description, test plan)
license: MIT
compatibility: Requires Azure DevOps CLI (az repos)
metadata:
  author: ancleto
  version: '1.0'
  category: git-workflow
---

Create a pull request in Azure DevOps following semantic standards.

**When to use**: User wants to create a PR for their current branch.

**Steps**

1. **Validate branch state**

   ```bash
   git rev-parse --abbrev-ref HEAD
   git status
   ```

   **Checks:**

   - ❌ If on protected branch (main, master, develop, qa, sandbox): Error and stop
   - ⚠️ If uncommitted changes: Warn and suggest committing first
   - ✅ If clean: Proceed

2. **Check remote tracking**

   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
   ```

   If no upstream tracking:

   - Suggest: `git push -u origin <branch-name>`
   - Ask if they want to push now or do it manually

3. **Determine base branch**

   Ask the user (using AskUserQuestion):

   - "What branch should this PR merge into?"
     - Option 1: "main" (Recommended for most features)
     - Option 2: "develop" (if using gitflow)
     - Option 3: "Other (specify)"

4. **Analyze all changes in the PR**

   ```bash
   git log <base-branch>..HEAD --oneline
   git diff <base-branch>...HEAD --stat
   ```

   Review ALL commits that will be included, not just the latest one.

5. **Generate PR title and description**

   **Title format:** `type: Short description (<70 chars)`

   - Use the same types as commits: feat, fix, chore, docs, etc.
   - Keep concise, details go in description

   **Description format:**

   ```markdown
   ## Summary

   - Bullet point 1 of main changes
   - Bullet point 2 of main changes
   - Bullet point 3 of main changes

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

   **On success:**

   - Show the PR URL
   - Suggest next steps: request reviewers, link work items, etc.

   **On error:**

   - If "az not found": Install Azure CLI and authenticate
   - If "not authenticated": Run `az login`
   - If other errors: Show error and suggest manual PR creation

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

- See `CONTRIBUTING.md` for the PR review process
