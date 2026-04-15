import { browser } from '../browser.js';
import { snapshot } from '../snapshot.js';
import { unifiedDiff } from '../diff.js';
import { annotatedScreenshot } from '../annotate.js';
import { cleanup } from '../cleanup.js';
import { text, image, type ToolModule } from './types.js';

export const snapshotTools: ToolModule = {
  tools: [
    {
      name: 'browser_snapshot',
      description:
        'Accessibility-tree snapshot of the current page with @e refs for interactive elements. Default: interactive-only (compact). Pass full=true for the structural tree. Pierces shadow DOM and traverses iframes (refs from iframe N look like @fNeM). Use refs as selectors in subsequent click/type calls. diff=true returns a unified diff against the previous snapshot (first call stores baseline). Output is truncated at max_lines — use selector to drill into a subtree if you need more.',
      inputSchema: {
        type: 'object',
        properties: {
          full: {
            type: 'boolean',
            description: 'Full structural tree (default: interactive-only)',
          },
          interactive: {
            type: 'boolean',
            description: 'Deprecated — interactive is now default. Ignored when full=true.',
          },
          cursor_interactive: {
            type: 'boolean',
            description:
              'Also include @c refs for non-ARIA clickables (div/span with cursor:pointer). Useful for React apps that skip semantic HTML.',
          },
          max_depth: { type: 'number', description: 'Max tree depth' },
          selector: {
            type: 'string',
            description: 'CSS selector to scope the tree to the subtree rooted at the first match',
          },
          max_lines: { type: 'number', description: 'Truncate output at N lines (default 500)' },
          diff: { type: 'boolean', description: 'Return diff vs previous snapshot' },
          clean: {
            type: 'boolean',
            description:
              'Run cleanup (all categories: ads, cookie banners, sticky bars, social popups) before snapshotting',
          },
          no_collapse: {
            type: 'boolean',
            description:
              'Emit the literal tree without collapsing single-child [generic] wrapper chains (default: collapse enabled)',
          },
        },
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
      name: 'browser_responsive',
      description:
        'Take screenshots at three viewports in one call: mobile (375x812), tablet (768x1024), desktop (1280x720). Returns three PNGs so you can verify responsive layout.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  handlers: {
    async browser_snapshot(a) {
      const page = await browser.getPage();
      const interactiveOnly = a.full ? false : a.interactive !== false;
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
        tree =
          kept.join('\n') +
          `\n\n[... truncated ${dropped} more lines. Re-call with selector="<css>" to scope, or max_lines=<N> to expand.]`;
      }
      if (a.diff) {
        const prev = browser.lastSnapshot;
        browser.lastSnapshot = tree;
        if (!prev) return text(`(baseline stored)\n\n${tree}`);
        return text(unifiedDiff(prev, tree));
      }
      browser.lastSnapshot = tree;
      return text(tree);
    },

    async browser_screenshot(a) {
      const page = await browser.getPage();
      const buf = a.selector
        ? await page.locator(a.selector).screenshot()
        : await page.screenshot({ fullPage: !!a.full_page });
      return image(buf);
    },

    async browser_screenshot_annotated() {
      const page = await browser.getPage();
      // Tag interactive elements with data-browse-ref. interactive:true is
      // much faster than the full-tree walk and is all annotate needs.
      await snapshot(page, { interactive: true });
      // Brief settling moment for any refs that affect layout (e.g. focus rings).
      await page.waitForTimeout(100);
      const buf = await annotatedScreenshot(page);
      return image(buf);
    },

    async browser_responsive() {
      const page = await browser.getPage();
      const viewports = [
        { label: 'mobile', w: 375, h: 812 },
        { label: 'tablet', w: 768, h: 1024 },
        { label: 'desktop', w: 1280, h: 720 },
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
    },
  },
};
