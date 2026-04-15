# browse-mcp

[![build](https://github.com/That1Drifter/browse-mcp/actions/workflows/build.yml/badge.svg)](https://github.com/That1Drifter/browse-mcp/actions/workflows/build.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)

A headless-browser MCP server for Claude (or any MCP client). Playwright-based, with accessibility-tree refs, Readability article extraction, search without an API key, a research macro that bundles search-and-read into one call, annotated screenshots, and a self-improvement feedback loop.

## Project status

**browse-mcp is pre-1.0 and actively developed by a single maintainer.** Treat it as early-stage software:

- API surface (tool names, arguments, output shapes) may change between minor versions until 1.0.
- Breaking changes are possible on any 0.x bump; pin a version in production use.
- No community validation yet — you may be the first user to hit a given edge case.
- Search endpoints scrape DuckDuckGo/Bing HTML and can break without notice (see issue #3).
- The persistent Chromium profile stores cookies/sessions on disk — review issue #8 before trusting it with sensitive accounts.

Feedback, bug reports, and PRs are welcome via the [issue tracker](https://github.com/That1Drifter/browse-mcp/issues). Near-term priorities live in [ROADMAP.md](./ROADMAP.md).

## Why another browser MCP?

Microsoft's [playwright-mcp](https://github.com/microsoft/playwright-mcp) is excellent for test-style automation — it assumes you know what you want to do and drives the browser deterministically. browse-mcp is built for the opposite shape of task: **reading, researching, and scraping real-world pages from a conversational agent**, where the agent doesn't know the page structure in advance.

The differentiators:

- **`browser_research`** — single call: search → visit top N results → run Readability on each → return concatenated Markdown. Replaces a 10-roundtrip workflow.
- **`browser_read`** — Readability extraction for clean article text (no scripts, nav, ads, chrome).
- **`browser_search` / `_news` / `_images`** — DuckDuckGo + Bing fallback, no API key, no browser launch per query.
- **Accessibility-tree snapshots with `@eN` refs** — interactive-only by default, collapses single-child wrappers, pierces shadow DOM and iframes. Far more compact than a full DOM dump.
- **Self-improvement loop** — every tool error auto-logs to `~/.browse-mcp/issues.jsonl`. `browser_report_difficulty` lets the agent flag subtler friction. `browser_review_issues` surfaces known rough edges at session start.
- **Persistent profile** — OAuth/MFA/CAPTCHA solves survive across sessions.

If you need strict test-style automation and multiple isolated contexts, reach for playwright-mcp. If you're building an agent that needs to read and research the live web, reach for this.

## Install

Requires Node.js ≥ 18.

**Option A — `npx` (no clone):**

```bash
npx browse-mcp
```

(Playwright-bundled Chromium will download on first launch.)

**Option B — from source:**

```bash
git clone https://github.com/That1Drifter/browse-mcp.git
cd browse-mcp
npm install
npx playwright install chromium
npm run build
```

## Register with Claude Code

```bash
claude mcp add browse -- npx -y browse-mcp
```

Or, for a local checkout:

```bash
claude mcp add browse -- node /absolute/path/to/browse-mcp/dist/index.js
```

## Register with Claude Desktop

Edit the config file (create it if it doesn't exist):

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add:

```json
{
  "mcpServers": {
    "browse": {
      "command": "npx",
      "args": ["-y", "browse-mcp"]
    }
  }
}
```

If an `"mcpServers"` block already exists, add the `"browse"` entry inside it. Then **fully quit and relaunch Claude Desktop** (tray icon → Quit, or Cmd+Q — closing the window is not enough). The `browser_*` tools will appear under the chat input's tool menu on next launch.

**Windows PATH gotcha:** Claude Desktop on Windows doesn't inherit your shell's PATH, so `npx` may not resolve. Use an absolute path:

```json
{
  "mcpServers": {
    "browse": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["-y", "browse-mcp"]
    }
  }
}
```

(Note the `.cmd` suffix and escaped backslashes.)

First launch downloads Playwright's bundled Chromium (~150 MB). To avoid a startup delay on first use, pre-cache it once: run `npx browse-mcp` from a terminal and Ctrl+C once Chromium finishes downloading.

## Schema budget

All 37 tools exposed at once is roughly **4.9K tokens / 19.5 KB** of schema — about 5% of a 100K context window, before any actual work.

Clients that support **lazy tool loading** (Claude Code's `ToolSearch` does) don't pay this up front. For clients that don't, restrict the exposed list via the `BROWSE_MCP_TOOLS` env var:

```bash
# Named bundles (union of tools):
BROWSE_MCP_TOOLS=core,search,content

# Or specific tools:
BROWSE_MCP_TOOLS=browser_navigate,browser_snapshot,browser_read,browser_search

# Or mix:
BROWSE_MCP_TOOLS=core,browser_research
```

Bundles: `core` (nav/snapshot/click/type/eval/wait/close, 8 tools), `search` (4), `content` (3), `visual` (3), `debug` (6), `edit` (3), `session` (10). Omit the var to expose everything.

## Tools

### Navigation & interaction
| Tool | What it does |
|---|---|
| `browser_navigate` | Go to a URL. Auto-routes `.pdf` and `Download is starting` to `browser_download`. Suggests `browser_handoff` on captcha/Cloudflare interstitials. |
| `browser_click` | Click a `@ref` or CSS selector |
| `browser_type` | Fill an input; optional `press_enter` |
| `browser_press_key` | Press any keyboard key |
| `browser_hover` | Hover to trigger menus/tooltips |
| `browser_scroll` | Scroll to element, top, or bottom |
| `browser_find_text` / `browser_wait_for_text` | Find or wait for elements by visible text — pierces shadow DOM and iframes |
| `browser_wait_for` | Wait for selector / load state / timeout |
| `browser_close` | Tear down browser |

### Snapshot & content
| Tool | What it does |
|---|---|
| `browser_snapshot` | Accessibility tree with `@eN` (interactive) / `@cN` (cursor-pointer) refs. Args: `selector`, `clean`, `no_collapse`, `diff`, `max_lines`, `max_depth` |
| `browser_read` | Mozilla Readability → clean Markdown. `format`: `markdown` / `text` / `json` |
| `browser_links` | Enumerate anchors — `{text, href, ref}`. Filter by `href_pattern` (substring or `/regex/flags`), `text_pattern`, `same_origin_only`. Default skips unlabeled; `include_unlabeled` opt-in with slug fallback |
| `browser_extract_listings` | Structured listing scrape. `group_by`: `href` (marketplace), `row` (HN/Reddit/blog), `auto`. Parses year/price/distance/location/new/used/image |

### Search & research
| Tool | What it does |
|---|---|
| `browser_search` | Web search via DuckDuckGo HTML endpoint. No API key, no browser. Falls back to Bing if DDG returns nothing. Optional Brave Search API via `BROWSE_MCP_BRAVE_API_KEY` |
| `browser_search_news` | News search with timestamps and source |
| `browser_search_images` | Image search — title/image/thumbnail/dimensions/source |
| `browser_research` | **Macro:** search → read top N → concatenated Markdown. One call. |

> **Heads up — search endpoints are unofficial.** `browser_search` / `_news` / `_images` scrape `html.duckduckgo.com`, `duckduckgo.com/i.js`, `duckduckgo.com/news.js`, and Bing's `b_algo` HTML. None of these are documented APIs, so a provider layout change can break parsing. When a parser returns zero results, browse-mcp logs a structured event to `~/.browse-mcp/issues.jsonl` (visible via `browser_review_issues`) and surfaces an explanatory error. For a supported API-based fallback, set `BROWSE_MCP_BRAVE_API_KEY` to a [Brave Search API](https://api.search.brave.com/) key — Brave is then tried first for `browser_search`, with DDG/Bing as the backup path.

### Screenshots & visual
| Tool | What it does |
|---|---|
| `browser_screenshot` | PNG of page or element (`full_page`, `selector`) |
| `browser_screenshot_annotated` | PNG with red overlay boxes + `@ref` labels. Auto-runs snapshot first |
| `browser_responsive` | Mobile (375×812) + tablet (768×1024) + desktop (1280×720) in one call |

### Debugging & inspection
| Tool | What it does |
|---|---|
| `browser_eval` | Run a JS expression in page context |
| `browser_console` | Captured console messages. Per-tab by default; `all_tabs: true` for combined |
| `browser_network` | Captured network log. Same per-tab model. `failed_only`, `clear` |
| `browser_a11y_audit` | axe-core WCAG scan |
| `browser_inspect_css` | CDP cascade for one element. Shorthand/longhand deduped |

### Live editing
| Tool | What it does |
|---|---|
| `browser_modify_style` / `browser_undo_style` | Live CSS edits with an undo stack |
| `browser_cleanup` | Remove ads / cookies / sticky bars / social popups |

### Multi-tab & session
| Tool | What it does |
|---|---|
| `browser_tabs` / `browser_switch_tab` | List and switch tabs |
| `browser_handoff` / `browser_resume` | Hand current page to a visible Chrome for CAPTCHA/MFA, then back to headless. Persistent profile — auth survives sessions |
| `browser_download` | Save attachment downloads. `force_fetch: true` falls back to raw HTTP for plain files |
| `browser_reset_profile` | Nuke the persistent Chromium profile. Requires `confirm: true` |

### Self-improvement loop
| Tool | What it does |
|---|---|
| `browser_report_difficulty` | Claude logs friction or missing features to `~/.browse-mcp/issues.jsonl` |
| `browser_review_issues` | Read back auto-logged errors + reported difficulties |

## Self-improvement loop

Every tool error is auto-logged to `~/.browse-mcp/issues.jsonl` with the tool name, arguments, message, and current URL. Claude is prompted (via the `browser_report_difficulty` description) to log subtler friction — ref mismatches, noisy snapshots, retries, missing capabilities — even when no error fired.

At session start, an agent can run `browser_review_issues` to see known rough edges. Hand the log to a coding agent later to drive the next round of improvements.

Override the data dir with `BROWSE_MCP_HOME`.

## Design notes

- **Persistent profile**: `~/.browse-mcp/chromium-profile/`. OAuth, MFA, cookies, and CAPTCHA solves survive across sessions. This is convenient but has security trade-offs — see [SECURITY.md](SECURITY.md). Set `BROWSE_MCP_EPHEMERAL=1` for an in-memory-only profile, or use `browser_reset_profile` to wipe.
- **Soft stealth**: strips the `navigator.webdriver` tell and sets a realistic UA. Does not fight serious anti-bot systems. When blocked, `browser_navigate` suggests `browser_handoff` so a human can solve the challenge.
- **Refs pierce shadow DOM** and traverse iframes. Refs from iframe N look like `@fNeM`.
- **Search via DDG HTML endpoint + Bing fallback** sidesteps the bot-detection pages the JS-rendered SERPs serve to headless browsers.
- **Readability is fetched from unpkg at runtime** on first `browser_read` call and cached in module scope — no npm dep, no extra build step.

## Versioning

See [VERSIONING.md](VERSIONING.md) for the semver contract (what counts as a breaking change, what's minor, what's patch) and [CHANGELOG.md](CHANGELOG.md) for release history.

## License & attribution

MIT — see [LICENSE](LICENSE).

Design is heavily inspired by [gstack](https://github.com/garrytan/gstack)'s `browse` skill (MIT, © Garry Tan): the `@eN`/`@cN` ref system, snapshot-diff, annotated screenshots, handoff/resume, live CSS with undo, responsive batch, and cleanup heuristics all trace back to its design. No code is copied — browse-mcp is an independent TypeScript reimplementation targeting MCP.

Tool naming follows Microsoft's [playwright-mcp](https://github.com/microsoft/playwright-mcp) (Apache-2.0) conventions for familiarity.

Readability is [@mozilla/readability](https://github.com/mozilla/readability) (Apache-2.0), fetched at runtime from unpkg rather than bundled.

Full third-party notices: [NOTICE.md](NOTICE.md).
