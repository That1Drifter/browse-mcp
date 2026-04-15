#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { browser, DEFAULT_DATA_DIR } from './browser.js';
import { rm } from 'fs/promises';
import { snapshot, resolveRef } from './snapshot.js';
import { unifiedDiff } from './diff.js';
import { annotatedScreenshot } from './annotate.js';
import { logIssue, readIssues, logPath } from './issues.js';
import { runAxeAudit, formatA11yResult } from './a11y.js';
import { inspectElement, formatInspect } from './inspect.js';
import { cleanup } from './cleanup.js';
import { applyStyle, undoStyle, styleHistory } from './style.js';
import { findByText, waitForText } from './finder.js';
import { downloadUrl } from './download.js';
import { extractListings } from './listings.js';
import {
  duckDuckGoSearch,
  duckDuckGoNewsSearch,
  duckDuckGoImageSearch,
  formatResults,
  formatNewsResults,
} from './search.js';
import { readArticle, formatArticle } from './read.js';
import { collectLinks } from './links.js';
import { research } from './research.js';

const server = new Server(
  { name: 'browse-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL. Waits for load event.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        wait_until: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
          description: 'Wait condition (default: load)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_snapshot',
    description:
      'Accessibility-tree snapshot of the current page with @e refs for interactive elements. Default: interactive-only (compact). Pass full=true for the structural tree. Pierces shadow DOM and traverses iframes (refs from iframe N look like @fNeM). Use refs as selectors in subsequent click/type calls. diff=true returns a unified diff against the previous snapshot (first call stores baseline). Output is truncated at max_lines — use selector to drill into a subtree if you need more.',
    inputSchema: {
      type: 'object',
      properties: {
        full: { type: 'boolean', description: 'Full structural tree (default: interactive-only)' },
        interactive: { type: 'boolean', description: 'Deprecated — interactive is now default. Ignored when full=true.' },
        cursor_interactive: { type: 'boolean', description: 'Also include @c refs for non-ARIA clickables (div/span with cursor:pointer). Useful for React apps that skip semantic HTML.' },
        max_depth: { type: 'number', description: 'Max tree depth' },
        selector: { type: 'string', description: 'CSS selector to scope the tree to the subtree rooted at the first match' },
        max_lines: { type: 'number', description: 'Truncate output at N lines (default 500)' },
        diff: { type: 'boolean', description: 'Return diff vs previous snapshot' },
        clean: { type: 'boolean', description: 'Run cleanup (all categories: ads, cookie banners, sticky bars, social popups) before snapshotting' },
        no_collapse: { type: 'boolean', description: 'Emit the literal tree without collapsing single-child [generic] wrapper chains (default: collapse enabled)' },
      },
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element by @ref (from snapshot) or CSS selector.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '@eN ref or CSS selector' },
      },
      required: ['target'],
    },
  },
  {
    name: 'browser_type',
    description: 'Fill an input with text (replaces existing value).',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '@eN ref or CSS selector' },
        text: { type: 'string', description: 'Text to fill' },
        press_enter: { type: 'boolean', description: 'Press Enter after filling' },
      },
      required: ['target', 'text'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key on the focused element (e.g. Enter, Tab, Escape).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page. Returns PNG image.',
    inputSchema: {
      type: 'object',
      properties: {
        full_page: { type: 'boolean', description: 'Capture full scrollable page' },
        selector: { type: 'string', description: 'Screenshot only this element' },
      },
    },
  },
  {
    name: 'browser_screenshot_annotated',
    description:
      'Screenshot with red overlay boxes and @ref labels on every interactive element. Use for bug reports and visual verification of snapshot refs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_console',
    description: 'Get captured browser console messages (log/warn/error/etc). Set clear=true to reset the buffer after reading.',
    inputSchema: {
      type: 'object',
      properties: {
        errors_only: { type: 'boolean', description: 'Only error/warning entries' },
        clear: { type: 'boolean', description: 'Clear buffer after reading' },
        all_tabs: { type: 'boolean', description: 'Include entries from every tab (prefixed with [tab N])' },
      },
    },
  },
  {
    name: 'browser_network',
    description: 'Get captured network requests from the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        failed_only: { type: 'boolean', description: 'Only failed (status >= 400 or no response) requests' },
        clear: { type: 'boolean', description: 'Clear buffer after reading' },
        all_tabs: { type: 'boolean', description: 'Include entries from every tab (prefixed with [tab N])' },
      },
    },
  },
  {
    name: 'browser_wait_for',
    description: 'Wait for a selector to appear, a timeout, or a load state.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for' },
        timeout_ms: { type: 'number', description: 'Max wait in ms (default 15000)' },
        state: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle'],
          description: 'Load state to wait for',
        },
      },
    },
  },
  {
    name: 'browser_eval',
    description: 'Run a JavaScript expression in the page context and return the result as a string.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JS expression (not statement)' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'browser_close',
    description: 'Close the browser and release all resources.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_report_difficulty',
    description:
      'Log a usability problem with this MCP server so it can be improved. Call this proactively whenever a browse tool was awkward, surprising, or required workarounds — e.g. a ref did not match the element you expected, a snapshot was too noisy, you had to retry a click, a tool response was ambiguous, or a needed capability is missing. Be specific. These notes drive future improvements.',
    inputSchema: {
      type: 'object',
      properties: {
        note: {
          type: 'string',
          description: 'Plain-language description of the friction or missing capability',
        },
        context: {
          type: 'object',
          description: 'Optional: structured context (tool name, args, URL, what you tried)',
        },
      },
      required: ['note'],
    },
  },
  {
    name: 'browser_a11y_audit',
    description:
      'Run an axe-core WCAG accessibility audit on the current page. Returns violations grouped by rule, with impact, help text, and up to 5 offending nodes per rule. Use before shipping UI changes or when auditing a site for a11y issues.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_inspect_css',
    description:
      'Deep CSS inspection via Chrome DevTools Protocol. Returns the full cascade (matched rules in origin order), inline style, selected computed styles, and box model for one element. Great for debugging why styles look wrong.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or @ref of the element to inspect' },
        include_user_agent: { type: 'boolean', description: 'Include user-agent stylesheet rules (default: false)' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_find_text',
    description:
      'Find an element by visible text (pierces shadow DOM and iframes) and optionally act on it. Use when you know what the user would click but the ref system does not surface it — e.g. dynamically mounted UI, non-ARIA buttons, late-loading panels. Action defaults to "info" (just return what was found). Action "click" / "hover" / "scroll_into_view" / "focus" act on the element.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to search for (matches aria-label, title, placeholder, or textContent)' },
        role: { type: 'string', description: 'Optional role/tag filter: button, link, textbox, heading' },
        exact: { type: 'boolean', description: 'Exact match (default: substring)' },
        case_sensitive: { type: 'boolean', description: 'Case-sensitive match (default: false)' },
        action: {
          type: 'string',
          enum: ['info', 'click', 'hover', 'scroll_into_view', 'focus'],
          description: 'What to do when found (default: info)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_wait_for_text',
    description:
      'Wait up to timeout_ms for visible text to appear on the page (including inside shadow DOM and iframes). Useful after triggering an action that reveals a late-loading panel (e.g. YouTube transcript panel, toast notification).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to wait for' },
        role: { type: 'string', description: 'Optional role filter' },
        timeout_ms: { type: 'number', description: 'Max wait (default 10000)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_extract_listings',
    description:
      'Extract structured listings from a results/search/catalog page. Two grouping strategies: "href" (marketplace cards — dedupe anchors by href, keep the richest wrapper) and "row" (HN/Reddit/blog — detect the repeating row container, pick the title anchor per row, other row anchors go to `meta`). Default "auto" tries row then falls back to href. Parses year, price, distance, location, image, new/used. Returns a JSON array.',
    inputSchema: {
      type: 'object',
      properties: {
        href_pattern: {
          type: 'string',
          description: 'Filter to anchors whose href contains this substring, OR a /regex/flags literal (e.g. "/\\\\/l\\\\//")',
        },
        require_text: {
          type: 'string',
          description: 'Only return listings whose text contains this (case-insensitive)',
        },
        container_selector: {
          type: 'string',
          description: 'Scope search to inside this CSS selector (e.g. ".results-grid")',
        },
        group_by: {
          type: 'string',
          enum: ['href', 'row', 'auto'],
          description: 'Grouping mode. "href" = dedupe by URL (marketplace cards). "row" = detect repeating row container, pick title anchor per row, other anchors -> meta (HN/Reddit/blogs). "auto" (default) tries row, falls back to href.',
        },
      },
    },
  },
  {
    name: 'browser_download',
    description:
      'Download a URL that triggers a file download (PDF with attachment disposition, binary file, etc.). Returns the saved file path and size. Use when browser_navigate fails with "Download is starting". Pass force_fetch=true to fall back to a raw fetch() when the URL does not trigger a browser download event (useful for plain SVG/HTML/JSON URLs).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to download' },
        save_dir: { type: 'string', description: 'Optional directory (default: ~/.browse-mcp/downloads)' },
        force_fetch: {
          type: 'boolean',
          description: 'If the page does not trigger a download within ~3s, fall back to a raw fetch() of the URL (default false).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_hover',
    description: 'Hover over an element (by @ref or selector) to trigger hover states, menus, tooltips.',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '@ref or CSS selector' } },
      required: ['target'],
    },
  },
  {
    name: 'browser_scroll',
    description:
      'Scroll the page. With no args: scroll to bottom. With selector: scroll element into view. Useful for triggering lazy-loaded content.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '@ref or CSS selector to scroll into view' },
        to: { type: 'string', enum: ['top', 'bottom'], description: 'Scroll to top or bottom of page' },
      },
    },
  },
  {
    name: 'browser_responsive',
    description:
      'Take screenshots at three viewports in one call: mobile (375x812), tablet (768x1024), desktop (1280x720). Returns three PNGs so you can verify responsive layout.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_cleanup',
    description:
      'Remove visual clutter from the page. Flags: ads, cookies (cookie/GDPR banners), sticky (fixed/sticky headers + footers), social (share bars, newsletter popups), or all. Useful before taking clean screenshots or reducing snapshot noise.',
    inputSchema: {
      type: 'object',
      properties: {
        ads: { type: 'boolean' },
        cookies: { type: 'boolean' },
        sticky: { type: 'boolean' },
        social: { type: 'boolean' },
        all: { type: 'boolean', description: 'Apply all cleanup categories' },
      },
    },
  },
  {
    name: 'browser_modify_style',
    description:
      'Set a CSS property on element(s) matching a selector. Returns a change-id that can be passed to browser_undo_style. Useful for dogfooding design changes live. Applies inline styles — reload reverts.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (not @ref — applies to all matches)' },
        property: { type: 'string', description: 'CSS property name (e.g. "background-color")' },
        value: { type: 'string', description: 'CSS value (e.g. "#1a1a1a" or "20px")' },
        important: { type: 'boolean', description: 'Add !important (default false)' },
      },
      required: ['selector', 'property', 'value'],
    },
  },
  {
    name: 'browser_undo_style',
    description: 'Undo the last N style modifications (default 1). Pass count to undo multiple at once.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'How many changes to undo (default 1)' },
        show_history: { type: 'boolean', description: 'Just list the current undo stack without undoing' },
      },
    },
  },
  {
    name: 'browser_handoff',
    description:
      'Open the current page in a visible Chrome window so the user can interact (CAPTCHA, MFA, OAuth). State (cookies, localStorage, tabs) is preserved via a persistent profile. Because the profile at ~/.browse-mcp/chromium-profile/ survives across sessions, cookies/localStorage/auth persist too — so OAuth/MFA/CAPTCHA typically only needs to be completed once per service. After the user is done, call browser_resume to return to headless. USE SPARINGLY — only when you genuinely cannot proceed headlessly.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short reason shown to the user' },
      },
    },
  },
  {
    name: 'browser_resume',
    description:
      'Return from handoff to headless mode. Closes the visible Chrome window, reopens the page headlessly at the same URL with preserved state, and returns a fresh interactive snapshot so you can see where the user left off.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_search',
    description:
      'Web search via DuckDuckGo (HTML endpoint — no API key, no browser launch). Returns top results as title/url/snippet. Use this instead of navigating Google/Bing/DDG search pages: it bypasses the bot-detection interstitials those engines serve to headless browsers, and returns parsed structured results without spending a snapshot. Pass json=true to get a JSON array; otherwise returns a numbered text list.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Max results to return (default 10)' },
        region: { type: 'string', description: 'DDG region code, e.g. "us-en", "uk-en", "wt-wt"' },
        json: { type: 'boolean', description: 'Return raw JSON array instead of formatted text' },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_read',
    description:
      'Extract the main article content of the current page (or a URL) as clean Markdown using Mozilla Readability. Strips nav, ads, and chrome. Great for reading long-form articles without the noise of a full snapshot. Returns friendly error if no article was detected — fall back to browser_snapshot in that case.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to navigate to first (waitUntil domcontentloaded)' },
        format: {
          type: 'string',
          enum: ['markdown', 'text', 'json'],
          description: 'Output format (default: markdown). "text" = textContent only, "json" = raw parsed object.',
        },
      },
    },
  },
  {
    name: 'browser_links',
    description:
      'Enumerate every anchor on the current page as a JSON array of {text, href, ref}. Pierces shadow DOM and traverses same-origin iframes. Refs are included only for anchors currently tagged by a recent snapshot. Use href_pattern (substring or /regex/flags) and text_pattern (case-insensitive substring) to filter.',
    inputSchema: {
      type: 'object',
      properties: {
        href_pattern: { type: 'string', description: 'Substring or /regex/flags literal to match href' },
        text_pattern: { type: 'string', description: 'Case-insensitive substring to match link text' },
        same_origin_only: { type: 'boolean', description: 'Drop external links (default false)' },
        max: { type: 'number', description: 'Cap result count (default 200)' },
        include_unlabeled: { type: 'boolean', description: 'Include anchors with no discoverable label (fallback to a slug derived from the href path). Default false — unlabeled anchors are skipped.' },
      },
    },
  },
  {
    name: 'browser_search_news',
    description:
      'News search via DuckDuckGo (news.js JSON endpoint). Returns timestamped news items with title/url/snippet/source/date (e.g. "2 hours ago"). Pass json=true for a JSON array; otherwise returns a numbered text list.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Max results to return (default 10)' },
        region: { type: 'string', description: 'DDG region code, e.g. "us-en", "uk-en", "wt-wt"' },
        json: { type: 'boolean', description: 'Return raw JSON array instead of formatted text' },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_search_images',
    description:
      'Image search via DuckDuckGo (i.js JSON endpoint). Returns a JSON array of {title, image, thumbnail, url, width, height, source}. Requires a fresh vqd token, fetched automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Max results to return (default 20)' },
        safe_search: {
          type: 'string',
          enum: ['strict', 'moderate', 'off'],
          description: 'SafeSearch level (default: moderate)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_review_issues',
    description:
      'Read recent auto-logged errors and reported difficulties for this MCP server. Useful at the start of a session to surface known rough edges, or to plan improvements.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 30)' },
        kind: {
          type: 'string',
          enum: ['error', 'difficulty', 'all'],
          description: 'Filter by kind (default: all)',
        },
      },
    },
  },
  {
    name: 'browser_tabs',
    description:
      'List all open browser tabs as JSON: [{index, url, title, active}]. Use together with browser_switch_tab to drive multi-tab workflows (links that open in a new tab, popup windows, etc.).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_switch_tab',
    description:
      'Switch the active tab by index (from browser_tabs). Subsequent browse tools act on the chosen tab. Returns the new active URL.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Tab index from browser_tabs' },
      },
      required: ['index'],
    },
  },
  {
    name: 'browser_reset_profile',
    description:
      'Destructively reset the persistent Chromium profile directory. Closes the browser and recursively deletes the profile (cookies, localStorage, auth, cache). Use when the profile is in a bad state. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Must be true to proceed' },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'browser_research',
    description:
      'High-level research macro: searches DuckDuckGo for the query, navigates to the top N results in turn, runs Readability on each, and returns one concatenated Markdown document with per-source headers. Failed reads are listed in a "Skipped" section at the bottom rather than aborting the whole call. Per-source body is capped at ~6KB. Reuses the existing browser page — prior page state may influence navigation.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Research query' },
        max_results: { type: 'number', description: 'Number of top search results to read (default 5)' },
        region: { type: 'string', description: 'DDG region code, e.g. "us-en"' },
        format: {
          type: 'string',
          enum: ['markdown', 'text', 'json'],
          description: 'Output format (default: markdown)',
        },
      },
      required: ['query'],
    },
  },
];

// BROWSE_MCP_TOOLS env filter: comma-separated list of tool names OR named
// bundles (core, search, content, visual, debug, edit, session). Lets users
// cut the ~5K-token schema payload when their MCP client loads everything
// up front. Default: expose all tools.
const TOOL_BUNDLES: Record<string, string[]> = {
  core: ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type', 'browser_press_key', 'browser_wait_for', 'browser_eval', 'browser_close'],
  search: ['browser_search', 'browser_search_news', 'browser_search_images', 'browser_research'],
  content: ['browser_read', 'browser_links', 'browser_extract_listings'],
  visual: ['browser_screenshot', 'browser_screenshot_annotated', 'browser_responsive'],
  debug: ['browser_console', 'browser_network', 'browser_a11y_audit', 'browser_inspect_css', 'browser_report_difficulty', 'browser_review_issues'],
  edit: ['browser_modify_style', 'browser_undo_style', 'browser_cleanup'],
  session: ['browser_tabs', 'browser_switch_tab', 'browser_handoff', 'browser_resume', 'browser_download', 'browser_reset_profile', 'browser_hover', 'browser_scroll', 'browser_find_text', 'browser_wait_for_text'],
};
function filterTools(all: typeof tools): typeof tools {
  const raw = process.env.BROWSE_MCP_TOOLS;
  if (!raw) return all;
  const allowed = new Set<string>();
  for (const tok of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (TOOL_BUNDLES[tok]) for (const n of TOOL_BUNDLES[tok]) allowed.add(n);
    else allowed.add(tok);
  }
  return all.filter((t) => allowed.has(t.name));
}
const exposedTools = filterTools(tools);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: exposedTools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const a = args as Record<string, any>;

  try {
    switch (name) {
      case 'browser_navigate': {
        const page = await browser.getPage();
        const url: string = a.url;
        if (typeof url === 'string' && /\.pdf(\?.*)?$/i.test(url)) {
          const result = await downloadUrl(page, url);
          return text(
            `Detected download — saved to ${result.path} (${result.sizeBytes} bytes). Use browser_download to fetch directly next time.`
          );
        }
        try {
          await page.goto(url, { waitUntil: a.wait_until || 'load' });
        } catch (e: any) {
          if (/download is starting/i.test(e?.message || '')) {
            const result = await downloadUrl(page, url);
            return text(
              `Detected download — saved to ${result.path} (${result.sizeBytes} bytes). Use browser_download to fetch directly next time.`
            );
          }
          throw e;
        }
        let msg = `Navigated to ${page.url()}`;
        try {
          const currentUrl = page.url();
          const urlHit = /\/static-pages\/418|\/cdn-cgi\/|\/distil_r_captcha|\/_recaptcha/i.test(currentUrl);
          const bodyHit = await Promise.race([
            page.evaluate(() => {
              const t = (document.body?.innerText || '').toLowerCase();
              const title = (document.title || '').toLowerCase();
              const needles = ['checking your browser', 'verify you are human', 'captcha', 'cloudflare', 'challenge'];
              return needles.some((n) => t.includes(n) || title.includes(n));
            }),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 300)),
          ]);
          if (urlHit || bodyHit) {
            msg += `\n\n[heads-up] Looks like a bot-detection / CAPTCHA interstitial. Consider browser_handoff to let the user solve it interactively.`;
          }
        } catch { /* silent */ }
        return text(msg);
      }

      case 'browser_snapshot': {
        const page = await browser.getPage();
        const interactiveOnly = a.full ? false : (a.interactive !== false);
        const maxLines = typeof a.max_lines === 'number' ? a.max_lines : 500;
        if (a.clean) {
          await cleanup(page, { all: true });
        }
        let tree = await snapshot(page, {
          interactive: interactiveOnly,
          maxDepth: a.max_depth,
          selector: a.selector,
          cursorInteractive: !!a.cursor_interactive,
          noCollapse: !!a.no_collapse,
        });
        const lines = tree.split('\n');
        if (lines.length > maxLines) {
          const kept = lines.slice(0, maxLines);
          const dropped = lines.length - maxLines;
          tree = kept.join('\n') + `\n\n[... truncated ${dropped} more lines. Re-call with selector="<css>" to scope, or max_lines=<N> to expand.]`;
        }
        if (a.diff) {
          const prev = browser.lastSnapshot;
          browser.lastSnapshot = tree;
          if (!prev) return text(`(baseline stored)\n\n${tree}`);
          return text(unifiedDiff(prev, tree));
        }
        browser.lastSnapshot = tree;
        return text(tree);
      }

      case 'browser_click': {
        const page = await browser.getPage();
        if (a.target.startsWith('@')) {
          const { locator } = await resolveRef(page, a.target);
          await locator.click();
        } else {
          await page.click(a.target);
        }
        return text(`Clicked ${a.target}`);
      }

      case 'browser_type': {
        const page = await browser.getPage();
        if (a.target.startsWith('@')) {
          const { locator } = await resolveRef(page, a.target);
          await locator.fill(a.text);
          if (a.press_enter) await locator.press('Enter');
        } else {
          await page.fill(a.target, a.text);
          if (a.press_enter) await page.press(a.target, 'Enter');
        }
        return text(`Typed into ${a.target}`);
      }

      case 'browser_press_key': {
        const page = await browser.getPage();
        await page.keyboard.press(a.key);
        return text(`Pressed ${a.key}`);
      }

      case 'browser_screenshot': {
        const page = await browser.getPage();
        const buf = a.selector
          ? await page.locator(a.selector).screenshot()
          : await page.screenshot({ fullPage: !!a.full_page });
        return image(buf);
      }

      case 'browser_screenshot_annotated': {
        const page = await browser.getPage();
        // Tag interactive elements with data-browse-ref. interactive:true is
        // much faster than the full-tree walk and is all annotate needs.
        await snapshot(page, { interactive: true });
        // Brief settling moment for any refs that affect layout (e.g. focus rings).
        await page.waitForTimeout(100);
        const buf = await annotatedScreenshot(page);
        return image(buf);
      }

      case 'browser_console': {
        await browser.getPage();
        let entries = a.all_tabs ? browser.getAllConsoleLogs() : browser.consoleLog;
        if (a.errors_only) entries = entries.filter((e) => e.type === 'error' || e.type === 'warning');
        const out = entries.map((e) => {
          const prefix = a.all_tabs ? `[tab ${e.tabIndex ?? '?'}] ` : '';
          return `${prefix}[${e.type}] ${e.text}${e.location ? ` (${e.location})` : ''}`;
        }).join('\n');
        if (a.clear) browser.clearConsole();
        return text(out || '(no console messages)');
      }

      case 'browser_network': {
        await browser.getPage();
        let entries = a.all_tabs ? browser.getAllNetworkLogs() : browser.networkLog;
        if (a.failed_only) entries = entries.filter((e) => e.status === undefined || (e.status && e.status >= 400));
        const out = entries.map((e) => {
          const prefix = a.all_tabs ? `[tab ${e.tabIndex ?? '?'}] ` : '';
          return `${prefix}${e.method} ${e.status ?? 'pending'} ${e.url}`;
        }).join('\n');
        if (a.clear) browser.clearNetwork();
        return text(out || '(no network activity)');
      }

      case 'browser_wait_for': {
        const page = await browser.getPage();
        const timeout = a.timeout_ms ?? 15000;
        if (a.selector) await page.waitForSelector(a.selector, { timeout });
        else if (a.state) await page.waitForLoadState(a.state, { timeout });
        else await page.waitForTimeout(timeout);
        return text('ok');
      }

      case 'browser_eval': {
        const page = await browser.getPage();
        const result = await page.evaluate(new Function(`return (${a.expression});`) as any);
        return text(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      }

      case 'browser_close': {
        await browser.close();
        return text('Browser closed');
      }

      case 'browser_a11y_audit': {
        const page = await browser.getPage();
        const result = await runAxeAudit(page);
        return text(formatA11yResult(result));
      }

      case 'browser_inspect_css': {
        const page = await browser.getPage();
        let sel = a.selector;
        if (typeof sel === 'string' && sel.startsWith('@')) {
          const { selector } = await resolveRef(page, sel);
          sel = selector;
        }
        const cdp = await browser.getCdp();
        const result = await inspectElement(page, cdp, sel, !!a.include_user_agent);
        return text(formatInspect(result));
      }

      case 'browser_find_text': {
        const page = await browser.getPage();
        const found = await findByText(page, {
          text: a.text,
          role: a.role,
          exact: !!a.exact,
          caseSensitive: !!a.case_sensitive,
        });
        if (!found) return text(`(not found: ${JSON.stringify(a.text)}${a.role ? ` role=${a.role}` : ''})`);
        const desc = `Found <${found.tag.toLowerCase()}>${found.role ? ` role=${found.role}` : ''} "${found.text}"`;
        const action = a.action || 'info';
        const locator = found.frame.locator(found.selector);
        try {
          if (action === 'click') { await locator.click(); return text(`${desc} — clicked`); }
          if (action === 'hover') { await locator.hover(); return text(`${desc} — hovered`); }
          if (action === 'focus') { await locator.focus(); return text(`${desc} — focused`); }
          if (action === 'scroll_into_view') { await locator.scrollIntoViewIfNeeded(); return text(`${desc} — scrolled into view`); }
          return text(desc);
        } finally {
          // Strip the temp marker so repeated finds don't collide
          await found.frame.evaluate(`(()=>{const el=document.querySelector('[data-browse-find=${JSON.stringify(found.marker)}]');if(el)el.removeAttribute('data-browse-find');})()`).catch(()=>{});
        }
      }

      case 'browser_wait_for_text': {
        const page = await browser.getPage();
        const timeout = typeof a.timeout_ms === 'number' ? a.timeout_ms : 10000;
        const found = await waitForText(page, { text: a.text, role: a.role }, timeout);
        await found.frame.evaluate(`(m)=>{const el=document.querySelector('[data-browse-find="'+m+'"]');if(el)el.removeAttribute('data-browse-find');}`, found.marker).catch(()=>{});
        return text(`Found <${found.tag.toLowerCase()}>${found.role ? ` role=${found.role}` : ''} "${found.text}"`);
      }

      case 'browser_extract_listings': {
        const page = await browser.getPage();
        const listings = await extractListings(page, {
          hrefPattern: a.href_pattern,
          requireText: a.require_text,
          containerSelector: a.container_selector,
          groupBy: a.group_by,
        });
        return text(JSON.stringify(listings, null, 2));
      }

      case 'browser_download': {
        const page = await browser.getPage();
        const result = await downloadUrl(page, a.url, { saveDir: a.save_dir, forceFetch: !!a.force_fetch });
        return text(
          `Downloaded ${result.filename}\n  path: ${result.path}\n  size: ${result.sizeBytes} bytes\n  from: ${result.url}`
        );
      }

      case 'browser_hover': {
        const page = await browser.getPage();
        if (a.target.startsWith('@')) {
          const { locator } = await resolveRef(page, a.target);
          await locator.hover();
        } else {
          await page.hover(a.target);
        }
        return text(`Hovered ${a.target}`);
      }

      case 'browser_scroll': {
        const page = await browser.getPage();
        if (a.target) {
          if (a.target.startsWith('@')) {
            const { locator } = await resolveRef(page, a.target);
            await locator.scrollIntoViewIfNeeded();
          } else {
            await page.locator(a.target).first().scrollIntoViewIfNeeded();
          }
          return text(`Scrolled ${a.target} into view`);
        }
        const to = a.to || 'bottom';
        await page.evaluate((t: any) => {
          if (t === 'top') window.scrollTo(0, 0);
          else window.scrollTo(0, document.body.scrollHeight);
        }, to);
        return text(`Scrolled to ${to}`);
      }

      case 'browser_responsive': {
        const page = await browser.getPage();
        const viewports = [
          { label: 'mobile',  w: 375,  h: 812  },
          { label: 'tablet',  w: 768,  h: 1024 },
          { label: 'desktop', w: 1280, h: 720  },
        ];
        const images: Array<{ label: string; buf: Buffer }> = [];
        const original = page.viewportSize();
        for (const v of viewports) {
          await page.setViewportSize({ width: v.w, height: v.h });
          const buf = await page.screenshot({ type: 'png' });
          images.push({ label: `${v.label} (${v.w}x${v.h})`, buf });
        }
        if (original) await page.setViewportSize(original);
        return {
          content: [
            ...images.flatMap((i) => [
              { type: 'text' as const, text: i.label },
              { type: 'image' as const, data: i.buf.toString('base64'), mimeType: 'image/png' },
            ]),
          ],
        };
      }

      case 'browser_cleanup': {
        const page = await browser.getPage();
        const removed = await cleanup(page, {
          ads: !!a.ads,
          cookies: !!a.cookies,
          sticky: !!a.sticky,
          social: !!a.social,
          all: !!a.all,
        });
        return text(`Removed ${removed} element(s)`);
      }

      case 'browser_modify_style': {
        const page = await browser.getPage();
        const change = await applyStyle(page, a.selector, a.property, a.value, !!a.important);
        return text(
          `#${change.id} set ${change.property}=${change.newValue}${change.important ? ' !important' : ''} on ${change.matchCount} element(s). ` +
          `Previous: ${change.previousValue || '(unset)'}. Undo with browser_undo_style.`
        );
      }

      case 'browser_undo_style': {
        if (a.show_history) {
          const h = styleHistory();
          if (h.length === 0) return text('(undo stack empty)');
          return text(
            h.map((c) => `#${c.id} ${c.selector} { ${c.property}: ${c.newValue}${c.important ? ' !important' : ''}; } (prev: ${c.previousValue || '(unset)'})`).join('\n')
          );
        }
        const page = await browser.getPage();
        const count = typeof a.count === 'number' ? a.count : 1;
        const undone = await undoStyle(page, count);
        if (undone.length === 0) return text('(nothing to undo)');
        return text(`Undid ${undone.length} change(s): ${undone.map((c) => `#${c.id}`).join(', ')}`);
      }

      case 'browser_handoff': {
        const page = await browser.getPage();
        const url = page.url();
        await browser.switchMode('headed', url, a.reason || 'handoff');
        return text(
          `Visible Chrome window opened at ${url}. Reason: ${a.reason || '(unspecified)'}. ` +
          `Cookies/localStorage/auth persist across sessions via the profile at ~/.browse-mcp/chromium-profile/, so OAuth/MFA/CAPTCHA typically only needs to be completed once per service. ` +
          `Ask the user to complete the task, then call browser_resume.`
        );
      }

      case 'browser_resume': {
        const currentUrl = await (async () => {
          try {
            const p = (browser as any).page;
            return p && !p.isClosed() ? p.url() : undefined;
          } catch { return undefined; }
        })();
        await browser.switchMode('headless', currentUrl);
        const page = await browser.getPage();
        const tree = await snapshot(page, { interactive: true });
        return text(`Resumed headless at ${page.url()}\n\n${tree}`);
      }

      case 'browser_report_difficulty': {
        await logIssue({
          kind: 'difficulty',
          note: a.note,
          context: a.context,
          url: await currentUrl(),
        });
        return text(`Logged. Thanks — noted to ${logPath()}`);
      }

      case 'browser_search': {
        const max = typeof a.max_results === 'number' ? a.max_results : 10;
        const results = await duckDuckGoSearch(a.query, max, a.region);
        return text(a.json ? JSON.stringify(results, null, 2) : formatResults(results));
      }

      case 'browser_review_issues': {
        const limit = typeof a.limit === 'number' ? a.limit : 30;
        const kind = a.kind || 'all';
        const all = await readIssues(limit * 2);
        const filtered = kind === 'all' ? all : all.filter((i) => i.kind === kind);
        const slice = filtered.slice(-limit);
        if (slice.length === 0) return text('(no issues logged yet)');
        const lines = slice.map((i) => {
          const head = `[${i.ts}] ${i.kind}${i.tool ? ` ${i.tool}` : ''}`;
          const body = i.kind === 'error'
            ? `  error: ${i.error}${i.args ? `\n  args: ${JSON.stringify(i.args)}` : ''}${i.url ? `\n  url: ${i.url}` : ''}`
            : `  note: ${i.note}${i.context ? `\n  context: ${JSON.stringify(i.context)}` : ''}${i.url ? `\n  url: ${i.url}` : ''}`;
          return `${head}\n${body}`;
        });
        return text(lines.join('\n\n') + `\n\n(source: ${logPath()})`);
      }

      case 'browser_read': {
        const page = await browser.getPage();
        const format = (a.format as 'markdown' | 'text' | 'json') || 'markdown';
        const article = await readArticle(page, { url: a.url, format });
        if (!article || (!article.content && !article.textContent)) {
          return text(
            'Readability did not detect an article on this page. Fall back to browser_snapshot for a general accessibility tree.',
            true
          );
        }
        return text(formatArticle(article, format));
      }

      case 'browser_links': {
        const page = await browser.getPage();
        const links = await collectLinks(page, {
          hrefPattern: a.href_pattern,
          textPattern: a.text_pattern,
          sameOriginOnly: !!a.same_origin_only,
          max: typeof a.max === 'number' ? a.max : 200,
          includeUnlabeled: !!a.include_unlabeled,
        });
        return text(JSON.stringify(links, null, 2));
      }

      case 'browser_search_news': {
        const max = typeof a.max_results === 'number' ? a.max_results : 10;
        const results = await duckDuckGoNewsSearch(a.query, max, a.region);
        return text(a.json ? JSON.stringify(results, null, 2) : formatNewsResults(results));
      }

      case 'browser_search_images': {
        const max = typeof a.max_results === 'number' ? a.max_results : 20;
        const safe = (a.safe_search as 'strict' | 'moderate' | 'off') || 'moderate';
        const results = await duckDuckGoImageSearch(a.query, max, safe);
        return text(JSON.stringify(results, null, 2));
      }

      case 'browser_tabs': {
        await browser.getPage();
        const pages = browser.getAllPages();
        const active = (browser as any).page;
        const list = await Promise.all(
          pages.map(async (p, index) => ({
            index,
            url: p.url(),
            title: await p.title().catch(() => ''),
            active: p === active,
          }))
        );
        return text(JSON.stringify(list, null, 2));
      }

      case 'browser_switch_tab': {
        await browser.getPage();
        const pages = browser.getAllPages();
        const idx = a.index;
        if (typeof idx !== 'number' || idx < 0 || idx >= pages.length) {
          return text(`Invalid tab index ${idx}. Have ${pages.length} tab(s).`, true);
        }
        const target = pages[idx];
        browser.setActivePage(target);
        await target.bringToFront().catch(() => {});
        return text(`Switched to tab ${idx}: ${target.url()}`);
      }

      case 'browser_reset_profile': {
        if (browser.isEphemeral()) {
          await browser.close();
          return text('Ephemeral mode (BROWSE_MCP_EPHEMERAL=1): no persistent profile to delete. Browser closed; next call starts a fresh context.');
        }
        if (a.confirm !== true) {
          return text(
            'browser_reset_profile destructively deletes the persistent Chromium profile ' +
            `(at ${DEFAULT_DATA_DIR}), clearing all cookies, localStorage, saved auth, and cache. ` +
            'This cannot be undone. Re-call with confirm: true to proceed.',
            true
          );
        }
        await browser.close();
        const path = browser.getDataDir();
        await rm(path, { recursive: true, force: true });
        return text(`Profile reset. Removed: ${path}`);
      }

      case 'browser_research': {
        const page = await browser.getPage();
        const format = (a.format as 'markdown' | 'text' | 'json') || 'markdown';
        const { output } = await research(page, {
          query: a.query,
          maxResults: typeof a.max_results === 'number' ? a.max_results : 5,
          region: a.region,
          format,
        });
        return text(output);
      }

      default:
        return text(`Unknown tool: ${name}`, true);
    }
  } catch (err: any) {
    await logIssue({
      kind: 'error',
      tool: name,
      args: a,
      error: err?.message || String(err),
      url: await currentUrl(),
    });
    return text(`Error: ${err.message}`, true);
  }
});

async function currentUrl(): Promise<string | undefined> {
  try {
    // @ts-ignore — reach into manager without forcing a launch
    const page = (browser as any).page;
    if (page && !page.isClosed()) return page.url();
  } catch { /* ignore */ }
  return undefined;
}

function text(t: string, isError = false) {
  return { content: [{ type: 'text' as const, text: t }], isError };
}

function image(buf: Buffer) {
  return {
    content: [
      {
        type: 'image' as const,
        data: buf.toString('base64'),
        mimeType: 'image/png',
      },
    ],
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
