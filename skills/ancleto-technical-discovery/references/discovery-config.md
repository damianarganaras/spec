# Discovery configuration (`.ancletorc`)

`.ancletorc` is a JSON file at the repository root. `ancleto init` owns its installation fields
(`version`, `installedAt`, `profile`, `tool`, and `installedPaths`) and preserves the team's
`discovery` section when the tooling is reinstalled. The technical-discovery skill must never
rewrite any part of this file.

The optional `discovery` object configures the technical seed:

| Key | Meaning | Default |
| --- | --- | --- |
| `outputDir` | Relative directory for generated seed documents. | `docs/technical-discovery` |
| `archetype` | `auto`, `monorepo`, `api-layered`, `spa`, `ops-tooling`, or `service-legacy`. | `auto` |
| `readBudgetTokens` | Reading budget for a focused dossier. | `6000` |
| `exclude` | Extra glob patterns omitted from packs, coverage, and source hashes. | CLI defaults |

`node_modules` and `.git` are always excluded, even when the team supplies its own list.
When `exclude` is configured, it supplements those structural exclusions; it does not replace
them.

Never read `.ancletorc` directly during generation. Run `ancleto discovery --check` and use the
returned `config`, which has already validated the file, applied defaults, and reported any
unknown configuration keys. Pass its resolved exclusions to the one Repomix command as
described by `generation-pipeline.md`.
