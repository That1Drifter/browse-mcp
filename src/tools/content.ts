import { browser } from '../browser.js';
import { readArticle, formatArticle } from '../read.js';
import { collectLinks } from '../links.js';
import { extractListings } from '../listings.js';
import { text, type ToolModule } from './types.js';

export const content: ToolModule = {
  tools: [
    {
      name: 'browser_read',
      description:
        'Extract the main article content of the current page (or a URL) as clean Markdown using Mozilla Readability. Strips nav, ads, and chrome. Great for reading long-form articles without the noise of a full snapshot. Returns friendly error if no article was detected — fall back to browser_snapshot in that case.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Optional URL to navigate to first (waitUntil domcontentloaded)',
          },
          format: {
            type: 'string',
            enum: ['markdown', 'text', 'json'],
            description:
              'Output format (default: markdown). "text" = textContent only, "json" = raw parsed object.',
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
          href_pattern: {
            type: 'string',
            description: 'Substring or /regex/flags literal to match href',
          },
          text_pattern: {
            type: 'string',
            description: 'Case-insensitive substring to match link text',
          },
          same_origin_only: { type: 'boolean', description: 'Drop external links (default false)' },
          max: { type: 'number', description: 'Cap result count (default 200)' },
          include_unlabeled: {
            type: 'boolean',
            description:
              'Include anchors with no discoverable label (fallback to a slug derived from the href path). Default false — unlabeled anchors are skipped.',
          },
        },
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
            description:
              'Filter to anchors whose href contains this substring, OR a /regex/flags literal (e.g. "/\\\\/l\\\\//")',
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
            description:
              'Grouping mode. "href" = dedupe by URL (marketplace cards). "row" = detect repeating row container, pick title anchor per row, other anchors -> meta (HN/Reddit/blogs). "auto" (default) tries row, falls back to href.',
          },
        },
      },
    },
  ],
  handlers: {
    async browser_read(a) {
      const page = await browser.getPage();
      const format = (a.format as 'markdown' | 'text' | 'json') || 'markdown';
      const article = await readArticle(page, { url: a.url, format });
      if (!article || (!article.content && !article.textContent)) {
        return text(
          'Readability did not detect an article on this page. Fall back to browser_snapshot for a general accessibility tree.',
          true,
        );
      }
      return text(formatArticle(article, format));
    },

    async browser_links(a) {
      const page = await browser.getPage();
      const links = await collectLinks(page, {
        hrefPattern: a.href_pattern,
        textPattern: a.text_pattern,
        sameOriginOnly: !!a.same_origin_only,
        max: typeof a.max === 'number' ? a.max : 200,
        includeUnlabeled: !!a.include_unlabeled,
      });
      return text(JSON.stringify(links, null, 2));
    },

    async browser_extract_listings(a) {
      const page = await browser.getPage();
      const listings = await extractListings(page, {
        hrefPattern: a.href_pattern,
        requireText: a.require_text,
        containerSelector: a.container_selector,
        groupBy: a.group_by,
      });
      return text(JSON.stringify(listings, null, 2));
    },
  },
};
