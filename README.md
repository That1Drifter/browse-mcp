# browse-mcp

Headless browser MCP server for Claude. Persistent Chromium, accessibility-tree
snapshots with `@eN` refs, unified snapshot diffs, and annotated screenshots.

## Install

```bash
cd C:\browse-skill\browse-mcp
npm install
npx playwright install chromium
npm run build
```

## Register with Claude Code

Add to your Claude Code MCP config (`~/.claude.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "browse": {
      "command": "node",
      "args": ["C:\\browse-skill\\browse-mcp\\dist\\index.js"]
    }
  }
}
```

Or via CLI:

```bash
claude mcp add browse -- node C:\browse-skill\browse-mcp\dist\index.js
```

## Tools

| Tool | Description |
|---|---|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Accessibility tree with `@eN` refs; supports `interactive`, `selector`, `max_depth`, `diff` |
| `browser_click` | Click `@ref` or selector |
| `browser_type` | Fill an input; optional `press_enter` |
| `browser_press_key` | Press a keyboard key |
| `browser_screenshot` | Plain PNG of page or element |
| `browser_screenshot_annotated` | PNG with red overlay boxes + `@ref` labels |
| `browser_console` | Captured console messages (with `errors_only`, `clear`) |
| `browser_network` | Captured network log (with `failed_only`, `clear`) |
| `browser_wait_for` | Wait for selector / load state / timeout |
| `browser_eval` | Run a JS expression in page context |
| `browser_close` | Tear down browser |
| `browser_report_difficulty` | Claude logs friction/missing features for future improvement |
| `browser_review_issues` | Read back auto-captured errors + reported difficulties |
| `browser_a11y_audit` | axe-core WCAG scan |
| `browser_inspect_css` | CDP cascade for one element |
| `browser_handoff` / `browser_resume` | Persistent-profile switch to visible Chrome for CAPTCHA/MFA |
| `browser_hover` | Hover element to trigger menus/tooltips |
| `browser_scroll` | Scroll to element, top, or bottom |
| `browser_responsive` | Screenshots at mobile/tablet/desktop in one call |
| `browser_cleanup` | Remove ads/cookies/sticky/social clutter |
| `browser_modify_style` / `browser_undo_style` | Live CSS edits with undo stack |
| `browser_find_text` / `browser_wait_for_text` | Locate/wait for elements by visible text, shadow DOM aware |
| `browser_download` | Capture downloads (PDFs, binaries) and save to disk |
| `browser_extract_listings` | Scrape structured listings from catalog/search pages (dedupes multi-anchor cards, parses year/price/distance/location) |

## Self-improvement loop

Every tool error is auto-logged to `~/.browse-mcp/issues.jsonl` with the tool
name, arguments, error, and current URL. Claude is also prompted (via
`browser_report_difficulty`'s description) to log subtler friction — ref
mismatches, noisy snapshots, retries, missing capabilities.

At the start of a session, Claude can run `browser_review_issues` to surface
known rough edges. Later, hand the log to a coding agent to drive the next
round of improvements:

```bash
cat ~/.browse-mcp/issues.jsonl
```

Override location with `BROWSE_MCP_HOME`.

## Phase 2 (planned)

- `browser_handoff` / `browser_resume` — open visible Chrome for CAPTCHA/MFA
- `browser_inspect_css` — CDP cascade for a selector
- `browser_modify_style` + undo
- `browser_a11y_audit` — axe-core WCAG scan

## Phase 3 (polish)

- `browser_responsive` — mobile + tablet + desktop batch
- `browser_cleanup` — remove ads/cookies/sticky
- `browser_cursor_interactive` — `@c` refs for non-ARIA clickables

## License & attribution

browse-mcp is MIT licensed — see [LICENSE](LICENSE).

Design is heavily inspired by [gstack](https://github.com/garrytan/gstack)'s
`browse` skill (MIT, © Garry Tan): the `@eN`/`@cN` ref system, snapshot-diff,
annotated screenshots, handoff/resume, live-CSS-with-undo, responsive batch,
and cleanup heuristics all trace back to its design. No code is copied —
browse-mcp is an independent TypeScript reimplementation targeting MCP.

Tool naming follows Microsoft's
[playwright-mcp](https://github.com/microsoft/playwright-mcp) (Apache-2.0)
conventions for familiarity.

Full third-party notices: [NOTICE.md](NOTICE.md).
