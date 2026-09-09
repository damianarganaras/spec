# Output contract

The seed is concise, verifiable, and entirely written in Spanish. It does not cover every
file; it covers the decisions and paths an agent should not need to reconstruct from
scratch.

## Configuration, provenance, and legacy layouts

`.ancletorc` is the repository-level configuration and installation record maintained by
`ancleto init`. Its optional `discovery` section configures the seed's `outputDir`,
`archetype`, `readBudgetTokens`, and extra `exclude` globs. The skill consumes the resolved
copy returned by `ancleto discovery --check`; it never edits `.ancletorc` and does not treat it as
seed content or evidence.

## Include

- Architecture, entry points, and component boundaries.
- Business rules in configuration or duplicated across locations.
- Integrations, observable contracts, and private dependencies.
- Risks, coupling, and the impact of changing a component.
- Key paths that allow each claim to be checked.

Classify claims as `declarado`, `observado`, `inferido` (with confidence), `conflictivo`,
or `desconocido`. Do not invent facts; put evidence limits in `unknowns.md`.

## Size limits

- Root documents are dense and brief; do not repeat the same fact in several documents.
- Generate at most three focused dossiers.
- A dossier cites only files that explain its behaviour. It has no per-file or per-directory inventory.
- `inventory.md` uses globs or directories as orientation, not as an audit.

## Secrets

Never copy credential values. Name the variable, key, or file and state that its value was
omitted. Record the relevant risk in `decisions.md`.
