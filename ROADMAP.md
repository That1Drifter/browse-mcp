# Roadmap

browse-mcp is pre-1.0. This document sketches near-term priorities; it is not a commitment or a schedule. Items are derived from the current [open issues](https://github.com/That1Drifter/browse-mcp/issues) and may be reordered as feedback arrives.

## Toward 1.0

The goal for 1.0 is a stable tool API, a documented semver contract, and enough test coverage that refactors stop being scary.

### Stability & contract

- **Semver discipline** (#5) — commit to a clear semver contract so 0.x → 1.0 expectations are explicit, and breaking changes are flagged in the changelog.
- **Maturity docs** (#7) — this roadmap, README "Project status" section, and a CHANGELOG as the release cadence picks up.

### Quality & correctness

- **Test suite** (#4) — currently none. At minimum: unit tests for the accessibility-tree snapshot, search parser, and Readability wrapper; smoke tests for the tool registration layer.
- **ESLint + Prettier** (#1) — formatting and lint gates in CI.
- **Refactor `index.ts`** (#6) — split the 1081-line entry point into per-category tool registration modules (navigation, extraction, search, interaction, etc.) so the surface is easier to audit and extend.

### Robustness

- **Search endpoint fragility** (#3) — DDG/Bing HTML scrape is unofficial and will break periodically. Track alternative providers, add better fallback, and consider an opt-in API-keyed provider.
- **Readability bundling** (#2) — `browser_read` currently fetches Readability from unpkg at runtime. Bundle it so the tool works offline and cannot be hijacked by a compromised CDN.

### Security

- **Persistent profile risks** (#8) — document the threat model for the on-disk Chromium profile (cookies, saved auth) and add mitigations (opt-in ephemeral mode, clearer `browser_reset_profile` guidance, profile-location override).

## Post-1.0 / exploratory

Not committed, but on the radar:

- Per-session isolated contexts alongside the persistent profile.
- Structured extraction helpers beyond `browser_extract_listings`.
- A minimal benchmark comparing research-macro output quality against a plain search+fetch loop.

## How to influence the roadmap

File an issue, comment on an existing one, or open a PR. Real usage reports from anyone other than the author are the single most useful input right now.
