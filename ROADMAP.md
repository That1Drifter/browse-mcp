# Roadmap

browse-mcp is pre-1.0. This document sketches near-term priorities; it is not a commitment or a schedule. Items are derived from the current [open issues](https://github.com/That1Drifter/browse-mcp/issues) and may be reordered as feedback arrives.

## Toward 1.0

The goal for 1.0 is a stable tool API, a documented semver contract, and enough test coverage that refactors stop being scary.

### Recently shipped (0.4.0, 2026-05-27)

- Search resilience overhaul: layered provider chain (Brave key -> Tavily key -> fetch DDG -> fetch Bing -> rendered DDG -> rendered Bing) with structured telemetry on every fallback miss. Resolves the Cloudflare/TLS-JA3 interstitial wave that broke the scrape-only path.
- Tavily Search API as a second opt-in provider (`BROWSE_MCP_TAVILY_API_KEY`).
- `browser_read` works on github.com + Cloudflare-fronted sites by routing Readability through `page.evaluate` (bypasses strict `script-src` CSP).
- `browser_extract_listings` accepts slash-prefixed substrings like `/inventory/used` without throwing.

### Search & retrieval

- **Additional opt-in providers** — wire Serper (Google SERP), Exa (neural), and Jina Reader using the same pattern Tavily added. Each is small (~30 LOC), independent, and lets users pick whichever free tier they already have.
- **Tavily in news/images** — `browser_search_news` and `browser_search_images` still depend on the DDG JSON endpoints and have no API-key alternative.
- **Server-side Readability** — for sites where even `page.evaluate` Readability returns nothing (Cloudflare challenge body is empty), fetch the raw HTML separately and run Readability + jsdom in Node so empty page bodies don't masquerade as "no article".

### Quality & correctness

- **Coverage for the rendered fallback paths** — current `browser*Search` functions are only exercised live, not in vitest. Add Playwright integration tests gated by an env flag so CI can opt in without paying browser-launch latency on every run.
- **Schema-budget audit** — 37 tools is approaching the practical limit for non-lazy-loading MCP clients; review for tools that can be consolidated or moved behind `BROWSE_MCP_TOOLS` bundles.

### Stability

- **Tool name freeze** — pick a 1.0 surface and commit to it; anything still being renamed should be flagged in the changelog before 1.0.

## Post-1.0 / exploratory

Not committed, but on the radar:

- Per-session isolated contexts alongside the persistent profile.
- Structured extraction helpers beyond `browser_extract_listings` (table extraction, schema.org parsing).
- A minimal benchmark comparing research-macro output quality against a plain search+fetch loop.
- Self-hosted SearXNG instructions for users who want zero-API-key reliability and have infra to spare.

## How to influence the roadmap

File an issue, comment on an existing one, or open a PR. Real usage reports from anyone other than the author are the single most useful input right now.
