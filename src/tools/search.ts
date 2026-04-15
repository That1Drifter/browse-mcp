import { browser } from '../browser.js';
import {
  duckDuckGoSearch,
  duckDuckGoNewsSearch,
  duckDuckGoImageSearch,
  formatResults,
  formatNewsResults,
} from '../search.js';
import { research } from '../research.js';
import { text, type ToolModule } from './types.js';

export const search: ToolModule = {
  tools: [
    {
      name: 'browser_search',
      description:
        'Web search via DuckDuckGo (HTML endpoint — no API key, no browser launch). Returns top results as title/url/snippet. Use this instead of navigating Google/Bing/DDG search pages: it bypasses the bot-detection interstitials those engines serve to headless browsers, and returns parsed structured results without spending a snapshot. Pass json=true to get a JSON array; otherwise returns a numbered text list.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Max results to return (default 10)' },
          region: {
            type: 'string',
            description: 'DDG region code, e.g. "us-en", "uk-en", "wt-wt"',
          },
          json: { type: 'boolean', description: 'Return raw JSON array instead of formatted text' },
        },
        required: ['query'],
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
          region: {
            type: 'string',
            description: 'DDG region code, e.g. "us-en", "uk-en", "wt-wt"',
          },
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
      name: 'browser_research',
      description:
        'High-level research macro: searches DuckDuckGo for the query, navigates to the top N results in turn, runs Readability on each, and returns one concatenated Markdown document with per-source headers. Failed reads are listed in a "Skipped" section at the bottom rather than aborting the whole call. Per-source body is capped at ~6KB. Reuses the existing browser page — prior page state may influence navigation.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Research query' },
          max_results: {
            type: 'number',
            description: 'Number of top search results to read (default 5)',
          },
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
  ],
  handlers: {
    async browser_search(a) {
      const max = typeof a.max_results === 'number' ? a.max_results : 10;
      const results = await duckDuckGoSearch(a.query, max, a.region);
      return text(a.json ? JSON.stringify(results, null, 2) : formatResults(results));
    },

    async browser_search_news(a) {
      const max = typeof a.max_results === 'number' ? a.max_results : 10;
      const results = await duckDuckGoNewsSearch(a.query, max, a.region);
      return text(a.json ? JSON.stringify(results, null, 2) : formatNewsResults(results));
    },

    async browser_search_images(a) {
      const max = typeof a.max_results === 'number' ? a.max_results : 20;
      const safe = (a.safe_search as 'strict' | 'moderate' | 'off') || 'moderate';
      const results = await duckDuckGoImageSearch(a.query, max, safe);
      return text(JSON.stringify(results, null, 2));
    },

    async browser_research(a) {
      const page = await browser.getPage();
      const format = (a.format as 'markdown' | 'text' | 'json') || 'markdown';
      const { output } = await research(page, {
        query: a.query,
        maxResults: typeof a.max_results === 'number' ? a.max_results : 5,
        region: a.region,
        format,
      });
      return text(output);
    },
  },
};
