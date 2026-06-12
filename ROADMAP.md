# Roadmap

browse-mcp is pre-1.0. This document sketches near-term priorities; it is not a commitment or a schedule. Items are derived from the current [open issues](https://github.com/That1Drifter/browse-mcp/issues) and may be reordered as feedback arrives.

## Toward 1.0

The goal for 1.0 is a stable tool API, a documented semver contract, and enough test coverage that refactors stop being scary.

### Recently shipped

**0.6.0 (2026-06-12)** — closed six of the eight issues from the playwright-mcp gap analysis in one release:

- Interaction completeness: `browser_handle_dialog` (#34), `browser_select_option` / `browser_file_upload` / back/forward / `browser_drag` (#35), opt-in coordinate tools `browser_*_xy` via the `vision` bundle (#40).
- PDF text extraction in `browser_read` and `browser_research` (#36).
- `BROWSE_MCP_PROXY` + origin fence env vars (#37); `browser_save_state` / `browser_load_state` (#38).

**0.5.0 (2026-06-12):**

- Client-agnostic repositioning (multi-client registration docs, platform matrix, Windows/macOS CI), page-context-rich timeout errors with handoff hints, real version in MCP metadata, clean lint.

**0.4.x (2026-05-27):**

- Search resilience overhaul (layered provider chain with fallback telemetry), CSP-proof `browser_read`, Chromium via `postinstall`.

### Sessions & architecture

- **Per-session isolated contexts** ([#39](https://github.com/That1Drifter/browse-mcp/issues/39)): incognito-style contexts alongside the persistent profile. The last open item from the gap analysis; a structural refactor (refs, tabs, logs, and handoff currently assume one context), so it gets its own design pass.

### Search & retrieval

- **Additional opt-in providers**: wire Serper (Google SERP), Exa (neural), and Jina Reader using the same pattern Tavily added. Each is small (~30 LOC), independent, and lets users pick whichever free tier they already have.
- **Tavily in news/images**: `browser_search_news` and `browser_search_images` still depend on the DDG JSON endpoints and have no API-key alternative.
- **Server-side Readability**: for sites where even `page.evaluate` Readability returns nothing (Cloudflare challenge body is empty), fetch the raw HTML separately and run Readability + jsdom in Node so empty page bodies don't masquerade as "no article".

### Quality & correctness

- **Coverage for the rendered fallback paths**: current `browser*Search` functions are only exercised live, not in vitest. Add Playwright integration tests gated by an env flag so CI can opt in without paying browser-launch latency on every run.
- **Schema-budget audit**: 45 default tools (plus 3 opt-in) is at the practical limit for non-lazy-loading MCP clients; review for tools that can be consolidated or moved behind `BROWSE_MCP_TOOLS` bundles. The opt-in `vision` bundle is the pattern for future additions.

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
