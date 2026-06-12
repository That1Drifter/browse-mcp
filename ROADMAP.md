# Roadmap

browse-mcp is pre-1.0. This document sketches near-term priorities; it is not a commitment or a schedule. Items are derived from the current [open issues](https://github.com/That1Drifter/browse-mcp/issues) and may be reordered as feedback arrives.

## Toward 1.0

The goal for 1.0 is a stable tool API, a documented semver contract, and enough test coverage that refactors stop being scary.

### Recently shipped

**Unreleased on main (since 0.4.1):**

- Client-agnostic repositioning: registration docs for Codex CLI, Gemini CLI, Cursor, and VS Code alongside Claude Code / Claude Desktop, a platform-support matrix, and CI builds on Windows and macOS in addition to Ubuntu.
- Timeout and not-found errors from `browser_wait_for` / `browser_wait_for_text` / `browser_find_text` now include page context (URL, readyState, title, body excerpt) and a `browser_handoff` hint on bot-detection interstitials. `networkidle` waits warn that the state often never fires.
- MCP server metadata reports the real package version; lint is clean.

**0.4.x (2026-05-27):**

- Search resilience overhaul: layered provider chain (Brave -> Tavily -> fetch DDG -> fetch Bing -> rendered DDG -> rendered Bing) with structured telemetry on every fallback miss.
- `browser_read` works on github.com and Cloudflare-fronted sites (Readability via `page.evaluate` bypasses strict CSP).
- Chromium installed via `postinstall` so the first browser call works out of the box.

### Interaction completeness

A comparison against microsoft/playwright-mcp (2026-06) surfaced baseline interaction gaps. Tracked individually:

- **Dialog handling** ([#34](https://github.com/That1Drifter/browse-mcp/issues/34)): `alert`/`confirm`/`prompt` currently wedge the session; highest-priority gap.
- **Table-stakes tools** ([#35](https://github.com/That1Drifter/browse-mcp/issues/35)): `select_option`, file upload, back/forward navigation, drag and drop.
- **Coordinate-click fallback** ([#40](https://github.com/That1Drifter/browse-mcp/issues/40)): for canvas/map pages whose accessibility tree is empty; opt-in to protect the schema budget.

### Search & retrieval

- **PDF text extraction** ([#36](https://github.com/That1Drifter/browse-mcp/issues/36)): `browser_read` and `browser_research` dead-end at PDFs today; many research trails end in one.
- **Additional opt-in providers**: wire Serper (Google SERP), Exa (neural), and Jina Reader using the same pattern Tavily added. Each is small (~30 LOC), independent, and lets users pick whichever free tier they already have.
- **Tavily in news/images**: `browser_search_news` and `browser_search_images` still depend on the DDG JSON endpoints and have no API-key alternative.
- **Server-side Readability**: for sites where even `page.evaluate` Readability returns nothing (Cloudflare challenge body is empty), fetch the raw HTML separately and run Readability + jsdom in Node so empty page bodies don't masquerade as "no article".

### Sessions & deployment

- **Proxy support and origin allow/blocklist** ([#37](https://github.com/That1Drifter/browse-mcp/issues/37)): a proxy is the only anti-challenge lever on headless servers where handoff is impossible, and origin fencing is standard hardening for autonomous agents.
- **Storage state export/import** ([#38](https://github.com/That1Drifter/browse-mcp/issues/38)): move a logged-in session between machines without copying the whole Chromium profile.
- **Per-session isolated contexts** ([#39](https://github.com/That1Drifter/browse-mcp/issues/39)): incognito-style contexts alongside the persistent profile.

### Quality & correctness

- **Coverage for the rendered fallback paths**: current `browser*Search` functions are only exercised live, not in vitest. Add Playwright integration tests gated by an env flag so CI can opt in without paying browser-launch latency on every run.
- **Schema-budget audit**: 37 tools is approaching the practical limit for non-lazy-loading MCP clients; review for tools that can be consolidated or moved behind `BROWSE_MCP_TOOLS` bundles. New interaction tools (#34/#35/#40) must respect this.

### Stability

- **Tool name freeze**: pick a 1.0 surface and commit to it; anything still being renamed should be flagged in the changelog before 1.0.

## Post-1.0 / exploratory

Not committed, but on the radar:

- **Thin CLI entry point** ([#41](https://github.com/That1Drifter/browse-mcp/issues/41)): the ecosystem is drifting toward CLI-first agent tooling for token efficiency (Microsoft cites ~114k tokens per task via MCP vs ~27k via their companion CLI); a small CLI over the same core could serve shell-capable agents.
- Structured extraction helpers beyond `browser_extract_listings` (table extraction, schema.org parsing).
- A minimal benchmark comparing research-macro output quality against a plain search+fetch loop.
- Self-hosted SearXNG instructions for users who want zero-API-key reliability and have infra to spare.

## How to influence the roadmap

File an issue, comment on an existing one, or open a PR. Real usage reports from anyone other than the author are the single most useful input right now.
