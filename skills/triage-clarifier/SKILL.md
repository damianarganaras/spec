---
name: triage-clarifier
description: Clarification-needed triage helper. Use when the request sits between direct-implementation, direct-test-only, and spec-required, or when visible behavior impact is unclear.
---

# Triage Clarifier

## Goal

Reduce triage ambiguity; don't replace the orchestrator or start a spec workflow.

## Use only when

- the request isn't clearly `direct-implementation`, `direct-test-only`, or `spec-required`
- unclear whether it affects visible behavior, acceptance criteria, or product code
- one high-value clarification could materially improve confidence

## Do not use when

- the request already fits one category
- already clearly large enough for `spec-required`
- the user explicitly asked for the structured/spec path

## Inputs to preserve

- the user's original wording
- repo context already gathered by the orchestrator
- existing constraints, references, or acceptance criteria in the request

## Repository-context boundary

Triage classifies the request; it does not reconstruct the repository.

If repository context is needed to classify safely, don't sweep source files or inspect the implementation. Ask the orchestrator to delegate one focused question to `@technical-discovery`, which reads the repository's technical-discovery documents and returns cited context.

Never replace unavailable technical-discovery documents with a manual repository scan. Use provided context, ask the one permitted clarification question when it resolves the dominant ambiguity, or favor `spec-required` when material uncertainty remains.

## Internal evaluation

Evaluate silently before asking:

1. Strictly tests, or product code likely to change?
2. Expected behavior clear, or implementation needs assumptions?
3. Could it alter visible behavior, business rules, contracts, shared types, architecture, or integrations?
4. Small and local, or at risk of expanding once implementation starts?
5. If under-classified, would that create rework or architecture risk?
6. Low-risk, or does small size hide a behavior change or high-stakes logic (auth, payments, data integrity, security, shared contracts)? If small but high-risk, prefer `spec-required`.

## Classification rules

Classify without asking whenever possible:

- choose `direct-test-only` when the request is limited to tests for existing behavior
- choose `direct-implementation` when the change is small, local, and its expected result is clear
- choose `spec-required` when the request affects visible behavior, business rules, shared contracts, architecture, or is already broad

## Single-question policy

Ask at most one question. It must:

- target the highest-value ambiguity only
- be short and concrete
- separate exactly one boundary, such as:
  - test-only vs product change
  - local bugfix vs behavior change
  - small direct change vs structured/spec change

Do not ask multi-part questions.
Do not ask for implementation details unless required to classify safely.
Do not start an interview.

## Fallback policy

If one clarification still leaves meaningful ambiguity or risk, favor `spec-required`.

When in doubt, prefer the safer classification over an under-scoped direct path.

## Expected outcome

After applying this skill, the orchestrator should do exactly one of:

1. classify directly as `direct-test-only`
2. classify directly as `direct-implementation`
3. classify directly as `spec-required`
4. ask one concise clarification question

If option 4 happened and the answer still leaves the main ambiguity, classify as `spec-required`.

## What not to do

- do not create specs, design, tasks, or proposals
- do not trigger cleto or any workflow handoff
- do not ask more than one clarification question
- do not replace the orchestrator's final responsibility for classification
