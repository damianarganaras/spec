---
name: ancleto-commit
description: Create semantic git commit following conventional commits (conventional commits, protected branches, semantic messages)
license: MIT
compatibility: Requires git
metadata:
  author: ancleto
  version: '1.0'
  category: git-workflow
---

Create a semantic git commit following semantic commit standards.

**When to use**: User wants to commit changes with a proper semantic commit message.

**Steps**

1. **Check current branch and status**

   ```bash
   git rev-parse --abbrev-ref HEAD
   git status
   ```

   If on a protected branch (main, master, develop, qa, sandbox):

   - ⚠️ Warn the user
   - Suggest a feature branch: `feat/`, `fix/`, `chore/`
   - Ask whether to proceed anyway or create a branch first

2. **Determine commit scope**

   Ask the user (use the runtime question tool when available):

   - "What files should be included in this commit?"
     - Option 1: "Only staged files (git commit)" (Recommended if files are staged)
     - Option 2: "Stage and commit all changes (git add . && git commit)"
     - Option 3: "Let me stage files manually first"

   If option 3: stop, let the user stage files, then re-run this skill.

3. **Analyze changes**

   ```bash
   git diff --staged  # if only staged
   # or
   git diff          # if staging all
   ```

4. **Generate semantic commit message(s)**

   Based on the diff, propose 1-2 conventional commit messages:

   **Format:**

   ```
   type(scope): short description in present tense

   Detailed explanation of WHY this change is needed.
   Optional: Additional context, breaking changes, etc.

   ```

   **Types:** `feat` (new feature), `fix` (bug fix), `chore` (maintenance), `docs` (documentation), `refactor` (no behavior change), `test` (tests), `perf` (performance).

   **Scope:** Optional, e.g., `(api)`, `(ui)`, `(auth)`

5. **Show command before executing**

   Display the exact git command:

   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): description

   Detailed explanation

   EOF
   )"
   ```

   Use heredoc to ensure proper multi-line formatting.

6. **Execute commit**

   After user confirmation, execute the command, then run `git status` to verify success.

**Guardrails**

- ❌ NEVER modify git config
- ❌ NEVER force push or use destructive commands
- ❌ NEVER skip hooks (--no-verify) unless explicitly requested
- ❌ NEVER commit sensitive files (.env, credentials, tokens)
- ⚠️ Warn before committing to protected branches
- ✅ Always use heredoc for multi-line commit messages

**Related Documentation**

- See `git-commits.md` for full commit conventions
