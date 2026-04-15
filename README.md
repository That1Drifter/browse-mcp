# browse-mcp

A headless-browser MCP server for Claude (or any MCP client). Built on Playwright, with a persistent Chromium profile, accessibility-tree snapshots with `@eN`/`@cN` refs, Readability-based article extraction, search without an API key, and a self-improvement loop that logs tool friction back for later review.

37 tools across navigation, snapshotting, interaction, search, content extraction, multi-tab, a11y, CSS inspection, and visual diffing.

## Install

Requires Node.js 18+ and Git.

```bash
git clone https://github.com/That1Drifter/browse-mcp.git
cd browse-mcp
npm install
npx playwright install chromium
npm run build
```

## Register with Claude Code

```bash
claude mcp add browse -- node /absolute/path/to/browse-mcp/dist/index.js
```

Or edit `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "browse": {
      "command": "node",
      "args": ["/absolute/path/to/browse-mcp/dist/index.js"]
    }
  }
}
```

Windows paths work too — use escaped backslashes (`"C:\\path\\to\\dist\\index.js"`) in JSON.

## Tools

### Navigation & interaction
| Tool | What it does |
|---|---|
| `browser_navigate` | Go to a URL. Auto-routes `.pdf` and `Download is starting` responses to `browser_download`. Suggests `browser_handoff` on captcha/Cloudflare interstitials. |
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
| `browser_snapshot` | Accessibility tree with `@eN` (interactive) / `@cN` (cursor-pointer) refs. Args: `selector` (scope), `clean` (strip ads/banners first), `no_collapse` (don't collapse single-child chains), `diff`, `max_lines`, `max_depth` |
| `browser_read` | Main-article extraction via Mozilla Readability — returns clean Markdown. `format`: `markdown`/`text`/`json` |
| `browser_links` | Enumerate anchors — `{text, href, ref}`. Filter by `href_pattern` (substring or `/regex/flags`), `text_pattern`, `same_origin_only`. Default skips unlabeled anchors; `include_unlabeled` opt-in with slug fallback |
| `browser_extract_listings` | Structured listing scrape. `group_by`: `href` (marketplace cards), `row` (HN/Reddit/blog), or `auto`. Parses year/price/distance/location/new/used/image |

### Search & research
| Tool | What it does |
|---|---|
| `browser_search` | Web search via DuckDuckGo HTML endpoint — no API key, no browser launch. Auto-falls back to Bing if DDG returns nothing |
| `browser_search_news` | News search with relative timestamps and source |
| `browser_search_images` | Image search — title/image/thumbnail/dimensions/source |
| `browser_research` | High-level macro: search → read top N → concatenated Markdown with source headers. The biggest token-saver on a research task |

### Screenshots & visual
| Tool | What it does |
|---|---|
| `browser_screenshot` | PNG of page or element (`full_page`, `selector`) |
| `browser_screenshot_annotated` | PNG with red overlay boxes + `@ref` labels. Auto-runs `browser_snapshot` first so refs are always tagged |
| `browser_responsive` | One call → mobile (375×812), tablet (768×1024), desktop (1280×720) screenshots |

### Debugging & inspection
| Tool | What it does |
|---|---|
| `browser_eval` | Run a JS expression in page context |
| `browser_console` | Captured console messages. Per-tab by default; `all_tabs: true` for combined. `errors_only`, `clear` |
| `browser_network` | Captured network log. Same per-tab model. `failed_only`, `clear` |
| `browser_a11y_audit` | axe-core WCAG scan with violation details |
| `browser_inspect_css` | Chrome DevTools Protocol cascade for one element. Shorthand/longhand deduplicated |

### Live editing
| Tool | What it does |
|---|---|
| `browser_modify_style` / `browser_undo_style` | Live CSS edits with an undo stack. Dogfood design changes without rebuilding |
| `browser_cleanup` | Remove ads, cookie banners, sticky bars, social popups. Flags: `ads`, `cookies`, `sticky`, `social`, `all` |

### Multi-tab & session
| Tool | What it does |
|---|---|
| `browser_tabs` / `browser_switch_tab` | List and switch tabs. Subsequent tools act on the chosen tab |
| `browser_handoff` / `browser_resume` | Hand the current page to a visible Chrome window for CAPTCHA/MFA/OAuth, then return to headless. Persistent profile means auth survives across sessions |
| `browser_download` | Save attachment-disposition downloads (PDFs, binaries). `force_fetch: true` falls back to raw HTTP for plain files (SVG/JSON/HTML) |
| `browser_reset_profile` | Nuke the persistent Chromium profile (cookies, localStorage, auth). Requires `confirm: true` |

### Self-improvement loop
| Tool | What it does |
|---|---|
| `browser_report_difficulty` | Claude logs friction or missing features. Written to `~/.browse-mcp/issues.jsonl` |
| `browser_review_issues` | Read back auto-logged errors + reported difficulties. Useful at session start to surface known rough edges |

## Self-improvement loop

Every tool error is auto-logged to `~/.browse-mcp/issues.jsonl` along with the tool name, arguments, message, and current URL. Claude is prompted (via the `browser_report_difficulty` description) to log subtler friction proactively — ref mismatches, noisy snapshots, retries, missing capabilities.

At the start of a session, Claude can run `browser_review_issues` to see known rough edges. Hand the log to a coding agent later to drive the next round of improvements.

Override the data dir with `BROWSE_MCP_HOME`.

## Design notes

- **Persistent profile**: `~/.browse-mcp/chromium-profile/`. OAuth, MFA, cookies, and CAPTCHA solves survive across sessions.
- **Soft stealth**: strips the `navigator.webdriver` tell on every page, keeps a realistic UA. Doesn't fight hard-core anti-bot like DDG.
- **Refs pierce shadow DOM** and traverse iframes. Refs from iframe N look like `@fNeM`.
- **Search via DDG HTML endpoint + Bing fallback** avoids bot-detection interstitials that the JS-rendered search engines serve to headless browsers.
- **Readability is fetched from unpkg at runtime** on first `browser_read` call and cached in module scope — no npm dep, no build step.

## License & attribution

MIT — see [LICENSE](LICENSE).

Design is heavily inspired by [gstack](https://github.com/garrytan/gstack)'s `browse` skill (MIT, © Garry Tan): the `@eN`/`@cN` ref system, snapshot-diff, annotated screenshots, handoff/resume, live CSS with undo, responsive batch, and cleanup heuristics all trace back to its design. No code is copied — browse-mcp is an independent TypeScript reimplementation targeting MCP.

Tool naming follows Microsoft's [playwright-mcp](https://github.com/microsoft/playwright-mcp) (Apache-2.0) conventions for familiarity.

Readability is [@mozilla/readability](https://github.com/mozilla/readability) (Apache-2.0), fetched at runtime from unpkg rather than bundled.

Full third-party notices: [NOTICE.md](NOTICE.md).
