---
name: ancleto-security
description: Perform a comprehensive security audit of the codebase or a specific change. Checks for common vulnerabilities like SQL injection, XSS, hardcoded secrets, etc.
license: MIT
compatibility: No external binaries required. Works with any agent runtime.
metadata:
  author: ancleto
  version: '1.0'
---

# aspec Security Audit

Perform a comprehensive security audit of the project.

**Input**: Optionally a change name or directory (e.g., `add-auth`, `src/`); if omitted, infer from context.

## Steps

### 1. Identify the Scope
Determine if the user wants to review a specific file, recent changes, or the whole project. 

### 2. Basic Static Analysis
Run existing built-in static analysis tools (e.g., `npm run lint`) to catch obvious security issues caught by linters.

### 3. Agent Manual Review
Actively search for vulnerabilities in the target scope using file viewing and grep tools. Look for:
- **SQL Injections:** Check for concatenated queries instead of parameterized ones.
- **XSS (Cross-Site Scripting):** Review how user inputs are rendered in views.
- **Hardcoded Secrets:** Look for passwords, API tokens, or encryption keys in source code.
- **Command Injection:** Review usage of `exec`, `spawn`, or similar functions with unsanitized user input.
- **Path Traversal:** Check manipulation of file paths with user input.

### 4. Create Audit Report
Generate an artifact named `security_audit_report.md` detailing the findings:
- Classify by severity: Critical, High, Medium, Low.
- Show exactly in which file and line the issue occurs.
- Propose a remediation or corrected code.

### 5. Action Plan
Present the report to the user and offer to apply the security fixes.
