# Changelog

All notable changes to `browse-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

### Fixed
- MCP server metadata now reports the real package version (was hardcoded to `0.1.0`); the version is read from `package.json` at startup so it can no longer drift.
- Lint is clean (was 10 errors / 7 warnings): search errors now attach the caught error as `cause`, dead code removed in `inspect.ts`/`diff.ts`, unused imports dropped, `@ts-ignore` replaced with `@ts-expect-error` where a suppression is genuinely needed.

### Changed
- Repositioned as client-agnostic: README and package metadata no longer frame the server as Claude-specific. Added registration instructions for Codex CLI, Gemini CLI, Cursor, and VS Code alongside Claude Code / Claude Desktop, plus a platform-support matrix (Windows / Linux / macOS) documenting the Linux `playwright install-deps` step and the display requirement for `browser_handoff`.
- CI now builds and tests on Windows and macOS in addition to Ubuntu.

## [0.4.1] - 2026-05-27

### Fixed
- `postinstall` script now runs `playwright install chromium` so the Chromium binary is fetched at install time instead of erroring on first browser call with `Executable doesn't exist at .../chrome-headless-shell.exe`. Removes the manual `npx playwright install chromium` step from the source-install path (#29).

## [0.4.0] - 2026-05-27

### Added
- `BROWSE_MCP_TAVILY_API_KEY` opt-in [Tavily Search](https://app.tavily.com/) provider (1000 req/mo free, AI-curated). Tried after Brave in the search provider chain (#27).
- Playwright-rendered DDG/Bing fallback for `browser_search`. When the fetch-based scrape returns 0 (anti-bot interstitial or layout drift), the search reruns inside the real browser context and parses the live DOM. Layered chain: Brave (key) -> Tavily (key) -> fetch DDG -> fetch Bing -> rendered DDG -> rendered Bing (#24).
- Structured `difficulty` log entries with 600-char `htmlExcerpt`, page title, and URL when rendered DDG/Bing fallbacks return 0 results. Visible via `browser_review_issues` for drift debugging without a live repro (#26).

### Fixed
- `browser_extract_listings({ href_pattern: "/inventory/used" })` no longer throws `Invalid flags supplied to RegExp constructor 'used'`. `href_pattern` is now treated as a substring by default; the value is only parsed as a regex when wrapped in `/.../flags` AND flags validate against `/^[gimsuy]*$/`. Applied symmetrically to `browser_links` (#22).
- `browser_read` no longer fails with `Refused to execute inline script` on github.com, Cloudflare-challenged pages, and any site with strict `script-src` CSP. Readability source now runs through `page.evaluate(<string>)` (CDP `Runtime.evaluate`, which bypasses CSP) instead of `page.addScriptTag` which injects a real `<script>` element (#23).

### Changed
- `FRAGILITY NOTICE` in `src/search.ts` and the README search section now lead with the API-key recommendation. The scrape rungs are documented as a best-effort backstop; the new fallback chain and telemetry are documented as the response to Cloudflare/TLS-JA3 fingerprinting that increasingly blocks Playwright clients.

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

[Unreleased]: https://github.com/That1Drifter/browse-mcp/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/That1Drifter/browse-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/That1Drifter/browse-mcp/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/That1Drifter/browse-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/That1Drifter/browse-mcp/releases/tag/v0.2.0
