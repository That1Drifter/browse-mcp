# Changelog

All notable changes to `browse-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

## [0.3.0] - 2026-04-15

### Added
- `BROWSE_MCP_EPHEMERAL=1` runs Chromium without a persistent profile (no cookies/localStorage/tokens written to disk). `browser_reset_profile` no-ops under ephemeral mode.
- `BROWSE_MCP_BRAVE_API_KEY` opt-in Brave Search API fallback for web search; no-key behavior unchanged (DDG/Bing scrape).
- Search endpoints log structured issues to `browser_review_issues` when parsers return 0 results (likely layout change).
- `SECURITY.md` documenting persistent-profile risks, threat model, and mitigations.
- `ROADMAP.md` with near-term priorities toward 1.0.
- `VERSIONING.md` documenting the project's semver contract.
- `CHANGELOG.md` following Keep a Changelog structure.
- vitest test suite (50 unit tests covering search parsing, readability-to-markdown, diff, snapshot rendering, inspect formatting); `npm test` now runs in CI.
- ESLint (flat config, typescript-eslint) + Prettier, with `lint`, `format`, `format:check` scripts. Lint runs in CI (non-blocking initially).
- README "Project status" section.

### Changed
- Bundled `@mozilla/readability` as a dependency instead of fetching from unpkg at runtime. `browser_read` no longer requires network access for the Readability library.
- Split the 1081-line `src/index.ts` into per-category modules under `src/tools/` (navigation, snapshot, content, search, debug, edit, session, issues) + thin 120-line dispatcher. Tool behavior identical.
- Improved search error messages (layout-change diagnostics, Brave API hint).

## [0.2.1] - 2025

### Added
- CI badge in README.
- Comparison section in README.
- `BROWSE_MCP_TOOLS` environment variable for filtering exposed tools.

### Removed
- `prepack` hook (`dist/` is pre-built and shipped).

## [0.2.0] - 2025

### Added
- First public release — initial set of browser tools, accessibility-tree
  refs, Readability extraction, search, annotated screenshots.

[Unreleased]: https://github.com/That1Drifter/browse-mcp/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/That1Drifter/browse-mcp/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/That1Drifter/browse-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/That1Drifter/browse-mcp/releases/tag/v0.2.0
