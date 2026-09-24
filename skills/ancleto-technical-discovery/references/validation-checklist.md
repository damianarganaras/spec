# Validation checklist

- [ ] Every generated document is in Spanish.
- [ ] Required root documents exist and `ancleto discovery --check` reports `READY`.
- [ ] The resolved `config` from `ancleto discovery --check` was used; `.ancletorc` was not edited.
- [ ] There are at most three dossiers under `units/` (excluding `_map.md`).
- [ ] `index.md` lets a reader choose a destination without reading sibling documents.
- [ ] Each relevant claim cites a path and states its evidence when it is not direct.
- [ ] `decisions.md` concentrates rules, risks, and coupling without duplicating the overview.
- [ ] `inventory.md` declares directories or globs, not file lists.
- [ ] `unknowns.md` records what could not be verified.
- [ ] `seed-map.json` exists and maps each seed document to its source areas.
- [ ] No secret values are present.
