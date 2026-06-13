# Changelog

All notable changes to `browse-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

## [0.8.2] - 2026-06-13

### Security
- Confine caller-supplied write destinations to the browse-mcp data roots (CWE-22, reported privately by novice-22). `browser_download`'s `save_dir` is now resolved under `~/.browse-mcp/downloads` and `browser_save_state` / `browser_load_state`'s explicit `path` under `~/.browse-mcp/state`; absolute paths and `..` escapes are rejected, and download filenames are reduced to a bare basename. Previously a caller (a malicious MCP client, or an agent steered by indirect prompt injection) could pass an arbitrary `save_dir` and a URL whose body became the file contents, writing attacker-controlled bytes to any path (e.g. `~/.bashrc`). Relocate the roots with `BROWSE_MCP_HOME`. The `force_fetch` fallback now also honours `BROWSE_MCP_ALLOWED_ORIGINS` / `BROWSE_MCP_BLOCKED_ORIGINS`, which its raw `fetch()` previously bypassed.

## [0.8.1] - 2026-06-12

### Added
- `BROWSE_MCP_NO_STEALTH`: opt out of the `navigator.webdriver` strip for operators whose target sites' ToS expect automation to identify itself.

### Fixed
- README no longer claims Readability is "fetched from unpkg at runtime"; it has been bundled via the `@mozilla/readability` npm dependency since 0.3.0 (no runtime network fetch, works offline). Stale claim flagged by external review.

## [0.8.0] - 2026-06-12

### Added
- CLI mode (#41): `npx browse-mcp read|search|research ...` runs the same core as the MCP tools but writes results to stdout — token-light path for shell-capable agents. `read` handles HTML (Readability) and PDFs; `search` covers web/news/images with `--json`; `research` emits the concatenated document. Attaches to a running server's browser when it was started with `BROWSE_MCP_CDP` (localhost CDP port + discovery file, opt-in, security note in SECURITY.md); otherwise launches its own browser on the shared profile, ephemeral when locked. No args still starts the MCP server, so existing client configs are unaffected.

## [0.7.0] - 2026-06-12

### Added
- Per-session isolated contexts (#39): `browser_context` opens/switches/closes/lists named incognito-style contexts that share nothing with the persistent profile (no cookies/auth). All tools act on the active context; tabs are scoped to it; the stealth init script and origin fence apply per context. Isolated contexts are in-memory only and are lost on `browser_close`/`browser_handoff`. Pair with `browser_load_state` to inject scoped auth into a clean context. `session` bundle grows to 16 (46 default tools).
- `publish` GitHub Actions workflow: tag pushes (`v*`) build, test, and publish to npm via OIDC trusted publishing (no stored token). Release process in VERSIONING.md updated.

## [0.6.0] - 2026-06-12

### Added
- `browser_handle_dialog`: arm how the next `alert`/`confirm`/`prompt`/`beforeunload` dialog(s) are handled (accept/dismiss, prompt text, count), or call without `action` to see recent dialogs and the arm state. Unarmed dialogs are auto-dismissed (`beforeunload` auto-accepted so navigation proceeds) and recorded; unrequested dialogs are logged to issues.jsonl for the feedback loop (#34).
- `browser_select_option`: select `<select>` options by value, label, or index (#35).
- `browser_file_upload`: set local files on a file input directly, or click a chooser-opening element and feed the file chooser (#35).
- `browser_navigate_back` / `browser_navigate_forward`: tab history navigation (#35).
- Bundles updated: `core` gains back/forward/select_option (11 tools), `session` gains file_upload/handle_dialog (12 tools).
- `browser_drag`: drag one element onto another via mouse-based drag (covers HTML5 drag-and-drop and sortable lists); completes #35. Lives in the `session` bundle (13 tools).
- Coordinate mouse tools (#40): `browser_click_xy` / `browser_move_xy` / `browser_drag_xy` for canvas/map/game pages whose accessibility tree is empty; coordinates match `browser_screenshot` output. Opt-in only via `BROWSE_MCP_TOOLS=vision` (or by name); excluded from the default expose-all payload so they never cost schema budget unless requested.
- Storage state export/import (#38): `browser_save_state` / `browser_load_state` move cookies + localStorage between machines as a JSON file (default `~/.browse-mcp/state/<name>.json`, chmod 0600 where supported) without copying the whole Chromium profile. Load merges into the existing context; localStorage is applied by briefly visiting each origin. Pairs with `BROWSE_MCP_EPHEMERAL=1` for start-empty-load-exactly-what-you-need sessions. SECURITY.md mitigation 7 rewritten around the new tools.
- Proxy support (#37): `BROWSE_MCP_PROXY` (`http://`, `http://user:pass@`, `socks5://`) and `BROWSE_MCP_PROXY_BYPASS` are passed through to Chromium.
- Origin fence (#37): `BROWSE_MCP_ALLOWED_ORIGINS` / `BROWSE_MCP_BLOCKED_ORIGINS` restrict top-level navigation (host + subdomain matching, blocklist wins). `browser_navigate` refuses fenced URLs with a clear message; a context route backstop catches redirects, JS navigations, and new tabs and replaces the page with a "Blocked by origin fence" explanation. Blocked attempts are logged to issues.jsonl. New README "Configuration" section consolidates all env vars.
- PDF text extraction (#36): `browser_read` accepts a `.pdf` URL or local file path (e.g. the path `browser_download` reported) and returns the text with per-page markers, document title, and `max_pages` / `max_chars` caps (default 50 pages / 200k chars). `browser_research` extracts text from PDF results instead of skipping them. Scanned/image-only PDFs return a clear "no extractable text" error (no OCR). Uses `pdfjs-dist`, loaded lazily on first use.

## [0.5.0] - 2026-06-12

### Added
- Timeout and not-found errors from `browser_wait_for`, `browser_wait_for_text`, and `browser_find_text` now append page context: current URL, `document.readyState`, title, and a 300-char body excerpt, plus the existing bot-detection heads-up when the page looks like a CAPTCHA/Cloudflare interstitial. Driven by `issues.jsonl` entries where the agent retried longer timeouts against a challenge page it could not see.
- `networkidle` waits that time out now explain that the state often never fires on pages with analytics/websockets and suggest `load` or a selector wait; the `wait_until`/`state` schema descriptions carry the same warning.

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
