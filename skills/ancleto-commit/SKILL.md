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

**When to use**: User wants to commit changes with proper semantic commit message.

**Steps**

1. **Check current branch and status**

   ```bash
   git rev-parse --abbrev-ref HEAD
   git status
   ```

   If on a protected branch (main, master, develop, qa, sandbox):

   - ⚠️ Warn the user
   - Suggest creating a feature branch: `feat/`, `fix/`, `chore/`
   - Ask if they want to proceed anyway or create a branch first

2. **Determine commit scope**

   Ask the user (using AskUserQuestion):

   - "What files should be included in this commit?"
     - Option 1: "Only staged files (git commit)" (Recommended if files are staged)
     - Option 2: "Stage and commit all changes (git add . && git commit)"
     - Option 3: "Let me stage files manually first"

   If option 3: Stop and let user stage files, then re-run this skill.

3. **Analyze changes**

   ```bash
   git diff --staged  # if only staged
   # or
   git diff          # if staging all
   ```

4. **Generate semantic commit message(s)**

   Based on the diff, propose 1-2 commit messages following conventional commits:

   **Format:**

   ```
   type(scope): short description in present tense

   Detailed explanation of WHY this change is needed.
   Optional: Additional context, breaking changes, etc.

   ```

   **Types:**

   - `feat`: New feature
   - `fix`: Bug fix
   - `chore`: Maintenance (dependencies, configs, etc.)
   - `docs`: Documentation only
   - `refactor`: Code restructuring (no behavior change)
   - `test`: Adding/updating tests
   - `perf`: Performance improvement

   **Scope:** Optional, e.g., `(api)`, `(ui)`, `(auth)`

   **Examples:**

   ```
   feat(auth): add JWT token refresh mechanism

   Implements automatic token refresh before expiration to improve
   user experience and reduce re-authentication requests.

   ```

5. **Show command before executing**

   Display the exact git command that will be executed:

   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): description

   Detailed explanation

   EOF
   )"
   ```

   Use heredoc format to ensure proper multi-line formatting.

6. **Execute commit**

   After user confirmation, execute the command.
   Then run `git status` to verify success.

**Guardrails**

- ❌ NEVER modify git config
- ❌ NEVER force push or use destructive commands
- ❌ NEVER skip hooks (--no-verify) unless explicitly requested
- ❌ NEVER commit sensitive files (.env, credentials, tokens)
- ⚠️ Warn before committing to protected branches
- ✅ Always use heredoc for multi-line commit messages

**Related Documentation**

- See `git-commits.md` for full commit conventions
