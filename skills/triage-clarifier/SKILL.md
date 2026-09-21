---
name: triage-clarifier
description: Clarification-needed triage helper. Use when the request sits between direct-implementation, direct-test-only, and spec-required, or when visible behavior impact is unclear.
---

# Triage Clarifier

## Goal

Reduce ambiguity during triage without replacing the orchestrator or starting a spec workflow.

## Use only when

- the request is not clearly `direct-implementation`, `direct-test-only`, or `spec-required`
- it is unclear whether the change affects visible behavior, acceptance criteria, or product code
- a single high-value clarification can materially improve classification confidence

## Do not use when

- the request already fits one category clearly
- the request is already clearly large enough for `spec-required`
- the user explicitly asked to open the structured/spec path

## Inputs to preserve

- the user's original wording
- any repo-specific context already gathered by the orchestrator
- any existing constraints, references, or acceptance criteria already present in the request

## Repository-context boundary

Triage classifies the request; it does not reconstruct the repository.

If repository context is needed to classify safely, do not sweep source files, broaden a
search, or inspect the implementation yourself. Ask the orchestrator to delegate one focused
question to `@technical-discovery`. That subagent reads the repository's technical-discovery
documents and returns the relevant, cited context for triage.

Never replace unavailable technical-discovery documents with a manual repository scan. Use the
context already provided, ask the one permitted clarification question when it resolves the
dominant ambiguity, or favor `spec-required` when material uncertainty remains.

## Internal evaluation

Before asking anything, evaluate these questions silently:

1. Is the request strictly about tests, or is product code likely to change?
2. Is the expected behavior already clear, or would implementation require assumptions?
3. Could the change alter visible behavior, business rules, contracts, shared types, architecture, or integrations?
4. Is the request small and local, or does it risk expanding once implementation starts?
5. If the team guessed wrong and under-classified it, would that create rework or architecture risk?
6. Is the change low-risk, or does its small size hide a behavior change or high-stakes logic (auth, payments, data integrity, security, shared contracts)? If small but high-risk, prefer `spec-required`.

## Classification rules

Classify without asking a question whenever possible:

- choose `direct-test-only` when the request is clearly limited to tests for existing behavior
- choose `direct-implementation` when the change is small, local, and the expected result is already clear
- choose `spec-required` when the request affects visible behavior, business rules, shared contracts, architecture, or scope is already meaningfully broad

## Single-question policy

Ask at most one question.

That question must:

- target the highest-value ambiguity only
- be short and concrete
- help separate exactly one boundary, such as:
  - test-only vs product change
  - local bugfix vs behavior change
  - small direct change vs structured/spec change

Do not ask multi-part questions.
Do not ask for implementation details unless they are required to classify safely.
Do not start an interview.

## Fallback policy

If one clarification still leaves meaningful ambiguity or risk, favor `spec-required`.

When in doubt, prefer the safer classification over an under-scoped direct path.

## Expected outcome

After applying this skill, the orchestrator should do exactly one of these:

1. classify directly as `direct-test-only`
2. classify directly as `direct-implementation`
3. classify directly as `spec-required`
4. ask one concise clarification question

If option 4 happened and the answer still does not remove the main ambiguity, classify as `spec-required`.

## What not to do

- do not create specs, design, tasks, or proposals
- do not trigger cleto or any workflow handoff
- do not ask more than one clarification question
- do not replace the orchestrator's final responsibility for classification