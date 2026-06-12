# browse-mcp

[![build](https://github.com/That1Drifter/browse-mcp/actions/workflows/build.yml/badge.svg)](https://github.com/That1Drifter/browse-mcp/actions/workflows/build.yml)
[![npm](https://img.shields.io/npm/v/browse-mcp.svg)](https://www.npmjs.com/package/browse-mcp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)

A headless-browser MCP server for any MCP-capable agent: Claude Code/Desktop, Codex CLI, Gemini CLI, Cursor, VS Code, or anything else that speaks [MCP](https://modelcontextprotocol.io) over stdio. Playwright-based, with accessibility-tree refs, Readability article extraction, PDF text extraction, search without an API key, a research macro that bundles search-and-read into one call, annotated screenshots, and a self-improvement feedback loop. Doubles as a [CLI](#cli) (`npx browse-mcp read <url>`) for token-light shell use. Runs on Windows, Linux, and macOS.

## Project status

**browse-mcp is pre-1.0 and actively developed by a single maintainer.** Treat it as early-stage software:

- API surface (tool names, arguments, output shapes) may change between minor versions until 1.0.
- Breaking changes are possible on any 0.x bump; pin a version in production use.
- No community validation yet — you may be the first user to hit a given edge case.
- The unofficial DDG/Bing scrape rungs in `browser_search` are increasingly blocked by Cloudflare and TLS-JA3 fingerprinting. As of 0.4.0 the tool falls back through several rungs (rendered Playwright, optional Brave / Tavily API keys) and logs each miss, but a free API key is strongly recommended for reliable search — see the [Search & research](#search--research) section.
- The persistent Chromium profile stores cookies/sessions on disk — review [SECURITY.md](./SECURITY.md) before trusting it with sensitive accounts.

Feedback, bug reports, and PRs are welcome via the [issue tracker](https://github.com/That1Drifter/browse-mcp/issues). Near-term priorities live in [ROADMAP.md](./ROADMAP.md); release history in [CHANGELOG.md](./CHANGELOG.md).

## Why another browser MCP?

Microsoft's [playwright-mcp](https://github.com/microsoft/playwright-mcp) is excellent for test-style automation — it assumes you know what you want to do and drives the browser deterministically. browse-mcp is built for the opposite shape of task: **reading, researching, and scraping real-world pages from a conversational agent**, where the agent doesn't know the page structure in advance.

The differentiators:

- **`browser_research`** — single call: search → visit top N results → run Readability on each → return concatenated Markdown. Replaces a 10-roundtrip workflow.
- **`browser_read`** — Readability extraction for clean article text (no scripts, nav, ads, chrome).
- **`browser_search` / `_news` / `_images`** — layered provider chain (optional Brave / Tavily keys -> fetch DDG -> fetch Bing -> Playwright-rendered fallback), with structured telemetry on every fallback miss.
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

(Playwright's bundled Chromium is installed automatically via `postinstall`.)

**Option B — from source:**

```bash
git clone https://github.com/That1Drifter/browse-mcp.git
cd browse-mcp
npm install
npm run build
```

## Platform support

| OS | Status |
|---|---|
| Windows 10/11 | Supported (primary development platform) |
| Linux | Supported. Headless by default, so it works on servers with no display. On minimal distros, run `npx playwright install-deps chromium` once to pull the shared libraries Chromium needs. `browser_handoff` opens a visible browser window, so it requires a desktop session; everything else works displayless. |
| macOS | Supported (CI-verified) |

The server itself is plain Node ≥ 18 with no platform-specific code; data lives under `~/.browse-mcp/` on every OS (override with `BROWSE_MCP_HOME`).

## Register with your MCP client

browse-mcp is a standard stdio MCP server with no client-specific features. Any client boils down to the same config: command `npx`, args `["-y", "browse-mcp"]` (or `node /absolute/path/to/browse-mcp/dist/index.js` for a local checkout).

### Claude Code

```bash
claude mcp add browse -- npx -y browse-mcp
```

### Codex CLI

```bash
codex mcp add browse -- npx -y browse-mcp
```

### Gemini CLI

```bash
gemini mcp add browse npx -y browse-mcp
```

Or add to `~/.gemini/settings.json`:

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

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

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

### VS Code (Copilot agent mode)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "browse": {
      "command": "npx",
      "args": ["-y", "browse-mcp"]
    }
  }
}
```

### Claude Desktop

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

Installing browse-mcp pulls in Playwright's bundled Chromium (~150 MB) via the `postinstall` script, so the first browser call is ready immediately. If the binary is somehow missing, run `npx playwright install chromium` to fetch it manually.

## Schema budget

All 46 default tools exposed at once is roughly **6.1K tokens / 24.5 KB** of schema — about 6% of a 100K context window, before any actual work.

Clients that support **lazy tool loading** (Claude Code's `ToolSearch` does) don't pay this up front. For clients that don't, restrict the exposed list via the `BROWSE_MCP_TOOLS` env var:

```bash
# Named bundles (union of tools):
BROWSE_MCP_TOOLS=core,search,content

# Or specific tools:
BROWSE_MCP_TOOLS=browser_navigate,browser_snapshot,browser_read,browser_search

# Or mix:
BROWSE_MCP_TOOLS=core,browser_research
```

Bundles: `core` (nav/history/snapshot/click/type/select/eval/wait/close, 11 tools), `search` (4), `content` (3), `visual` (3), `debug` (6), `edit` (3), `session` (16), `vision` (3 coordinate tools, **opt-in only**). Omit the var to expose everything except `vision`; the coordinate tools must be requested explicitly (`BROWSE_MCP_TOOLS=vision` or by name) so they never cost schema budget unless wanted.

## Configuration

All configuration is via env vars on the server process:

| Var | What it does |
|---|---|
| `BROWSE_MCP_TOOLS` | Restrict the exposed tool list (see [Schema budget](#schema-budget)) |
| `BROWSE_MCP_HOME` | Data directory (default `~/.browse-mcp`): profile, downloads, issues log |
| `BROWSE_MCP_EPHEMERAL` | `1`/`true`/`yes`: in-memory profile, nothing persisted |
| `BROWSE_MCP_BRAVE_API_KEY` / `BROWSE_MCP_TAVILY_API_KEY` | Search API providers (see [Search & research](#search--research)) |
| `BROWSE_MCP_PROXY` | Outbound proxy: `http://host:port`, `http://user:pass@host:port`, or `socks5://host:port` |
| `BROWSE_MCP_PROXY_BYPASS` | Comma-separated hosts that skip the proxy (e.g. `localhost,*.internal`) |
| `BROWSE_MCP_ALLOWED_ORIGINS` | Allowlist of hosts (plus subdomains) the browser may navigate to; everything else is refused |
| `BROWSE_MCP_BLOCKED_ORIGINS` | Hosts the browser must never navigate to (wins over the allowlist) |

| `BROWSE_MCP_CDP` | Opt-in: expose the browser's CDP endpoint on localhost (`1` = port 9223, or a port number) so the CLI can attach to the live session. **Any local process can drive the browser through this port** — see [SECURITY.md](./SECURITY.md) |

The origin fence applies to top-level navigations only (subresources load normally), covers redirects/JS navigations/new tabs via a route backstop, and logs blocked attempts to `issues.jsonl` — see [SECURITY.md](./SECURITY.md) for the threat model.

## CLI

The same binary doubles as a CLI for the token-heavy read-only operations, so shell-capable agents can skip MCP tool-call overhead entirely:

```bash
npx browse-mcp read <url>                # Readability markdown; .pdf URLs/paths get PDF text extraction
npx browse-mcp search "query" --max 5    # provider-chain web search (--news / --images / --json)
npx browse-mcp research "query"          # search + read top N -> one concatenated document
npx browse-mcp help                      # all flags
```

Results go to stdout, diagnostics to stderr, non-zero exit on failure.

Session model: if a browse-mcp server is running and was started with `BROWSE_MCP_CDP=1`, the CLI attaches to its live browser (same auth, same origin fence) and detaches when done. Otherwise it launches its own headless browser on the shared profile, falling back to an ephemeral context when the profile is locked by another instance.

## Tools

### Navigation & interaction
| Tool | What it does |
|---|---|
| `browser_navigate` | Go to a URL. Auto-routes `.pdf` and `Download is starting` to `browser_download`. Suggests `browser_handoff` on captcha/Cloudflare interstitials. |
| `browser_navigate_back` / `browser_navigate_forward` | Move through the tab history |
| `browser_click` | Click a `@ref` or CSS selector |
| `browser_type` | Fill an input; optional `press_enter` |
| `browser_select_option` | Select `<select>` option(s) by value, label, or index |
| `browser_file_upload` | Upload local files — set them on a file input, or click a chooser-opening element and feed the chooser |
| `browser_handle_dialog` | Arm how the next `alert`/`confirm`/`prompt` is handled (accept/dismiss, prompt text), or report recent dialogs. Unarmed dialogs are auto-dismissed and recorded |
| `browser_press_key` | Press any keyboard key |
| `browser_hover` | Hover to trigger menus/tooltips |
| `browser_drag` | Drag one element onto another (mouse-based; covers HTML5 drag-and-drop and sortable lists) |
| `browser_click_xy` / `browser_move_xy` / `browser_drag_xy` | Coordinate-based mouse for canvas/map/game pages with empty accessibility trees. **Opt-in** — not exposed by default; enable with `BROWSE_MCP_TOOLS=vision` (plus whatever bundles you need) |
| `browser_scroll` | Scroll to element, top, or bottom |
| `browser_find_text` / `browser_wait_for_text` | Find or wait for elements by visible text — pierces shadow DOM and iframes |
| `browser_wait_for` | Wait for selector / load state / timeout |
| `browser_close` | Tear down browser |

### Snapshot & content
| Tool | What it does |
|---|---|
| `browser_snapshot` | Accessibility tree with `@eN` (interactive) / `@cN` (cursor-pointer) refs. Args: `selector`, `clean`, `no_collapse`, `diff`, `max_lines`, `max_depth` |
| `browser_read` | Mozilla Readability → clean Markdown. `format`: `markdown` / `text` / `json`. Pass a `.pdf` URL or local path to extract PDF text instead (with `max_pages` / `max_chars` caps) |
| `browser_links` | Enumerate anchors — `{text, href, ref}`. Filter by `href_pattern` (substring or `/regex/flags`), `text_pattern`, `same_origin_only`. Default skips unlabeled; `include_unlabeled` opt-in with slug fallback |
| `browser_extract_listings` | Structured listing scrape. `group_by`: `href` (marketplace), `row` (HN/Reddit/blog), `auto`. Parses year/price/distance/location/new/used/image |

### Search & research
| Tool | What it does |
|---|---|
| `browser_search` | Web search. Tries configured API providers first (Brave, Tavily), then scrapes DuckDuckGo, then Bing, then a Playwright-rendered fallback. Works with zero config, but a free API key is recommended (see below). |
| `browser_search_news` | News search with timestamps and source |
| `browser_search_images` | Image search — title/image/thumbnail/dimensions/source |
| `browser_research` | **Macro:** search → read top N → concatenated Markdown. One call. PDF results are text-extracted instead of skipped. |

> **Recommended: set one search API key for reliable results.** The scrape rungs (DDG/Bing) regularly get hit by Cloudflare/TLS-JA3 challenges that return the "418 teapot" / 403 interstitial to Playwright. browse-mcp falls back across rungs and logs each failure, but the most reliable path is an API key. Both options below have generous free tiers and require nothing more than an email signup:
>
> | Provider | Free tier | Env var |
> |---|---|---|
> | [Brave Search API](https://api.search.brave.com/app/keys) | ~1k req/mo on the free credit | `BROWSE_MCP_BRAVE_API_KEY` |
> | [Tavily Search](https://app.tavily.com/) | 1000 req/mo, AI-curated results | `BROWSE_MCP_TAVILY_API_KEY` |
>
> Providers are tried in the order listed; on miss or failure we fall through to the next, then to the scrape rungs. With no keys set the tool still works (scrape only); silent fallback failures are logged to `~/.browse-mcp/issues.jsonl` and surfaced via `browser_review_issues`.

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
| `browser_save_state` / `browser_load_state` | Export/import cookies + localStorage as JSON — move auth between machines without copying the whole profile. The file contains live session tokens; treat it like a password file |
| `browser_context` | Open/switch/close/list isolated incognito-style contexts that share nothing with the persistent profile. In-memory only; lost on close/handoff. Pair with `browser_load_state` to inject scoped auth |
| `browser_reset_profile` | Nuke the persistent Chromium profile. Requires `confirm: true` |

### Self-improvement loop
| Tool | What it does |
|---|---|
| `browser_report_difficulty` | The agent logs friction or missing features to `~/.browse-mcp/issues.jsonl` |
| `browser_review_issues` | Read back auto-logged errors + reported difficulties |

## Self-improvement loop

Every tool error is auto-logged to `~/.browse-mcp/issues.jsonl` with the tool name, arguments, message, and current URL. The agent is prompted (via the `browser_report_difficulty` description) to log subtler friction — ref mismatches, noisy snapshots, retries, missing capabilities — even when no error fired.

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
