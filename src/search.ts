// DuckDuckGo HTML-endpoint search. No JS, no API key, no browser launch.
// Endpoint returns server-rendered HTML we can regex-parse for top results.
//
// FRAGILITY NOTICE
// ----------------
// None of the endpoints used here are official / documented APIs:
//   - https://html.duckduckgo.com/html/        (DDG HTML SERP)
//   - https://duckduckgo.com/i.js              (DDG images JSON, needs vqd token)
//   - https://duckduckgo.com/news.js           (DDG news JSON, needs vqd token)
//   - https://www.bing.com/search              (Bing b_algo HTML SERP fallback)
//
// The selectors / JSON shapes below are "last verified" as of 2026-04-15.
// When a provider changes layout, the parsers will quietly return zero
// results. We mitigate that by:
//   (1) logging a structured "parse returned 0" telemetry event to
//       ~/.browse-mcp/issues.jsonl (via logIssue) so CI / the agent can
//       notice silent breakage on `browser_review_issues`.
//   (2) falling back DDG -> Bing on empty / failure.
//   (3) offering an opt-in Brave Search API path via the
//       BROWSE_MCP_BRAVE_API_KEY env var. When set, Brave is tried first
//       for browser_search and used as a last-resort fallback for
//       browser_search_news. No key == current behavior.
//   (4) raising informative errors that mention the likely cause
//       (provider layout change) rather than a bare "no results".

import { logIssue } from './issues.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: 'ddg' | 'bing' | 'brave';
}

export interface NewsResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  date?: string;
}

export interface ImageResult {
  title: string;
  image: string;
  thumbnail: string;
  url: string;
  width: number;
  height: number;
  source: string;
}

const ENDPOINT = 'https://html.duckduckgo.com/html/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

// Parser version stamps. Bump when the upstream layout changes and we
// adjust selectors, so review-issues log entries are attributable.
const DDG_HTML_PARSER_VERSION = '2026-04-15';
const BING_HTML_PARSER_VERSION = '2026-04-15';
const DDG_NEWS_PARSER_VERSION = '2026-04-15';
const DDG_IMAGES_PARSER_VERSION = '2026-04-15';

function braveKey(): string | undefined {
  const k = process.env.BROWSE_MCP_BRAVE_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

export async function duckDuckGoSearch(
  query: string,
  maxResults = 10,
  region?: string
): Promise<SearchResult[]> {
  // Opt-in: Brave Search API first when a key is configured. Falls through
  // to DDG/Bing scrape on any Brave failure.
  const key = braveKey();
  if (key) {
    try {
      const r = await braveSearch(query, maxResults, key);
      if (r.length > 0) return r;
    } catch (err) {
      await logIssue({
        kind: 'error',
        tool: 'browser_search',
        error: `Brave API failed, falling back to DDG: ${(err as Error).message}`,
      });
    }
  }

  try {
    const body = new URLSearchParams({ q: query });
    if (region) body.set('kl', region);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://html.duckduckgo.com/',
      },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
    const html = await res.text();
    const results = parseResults(html, maxResults).map((r) => ({ ...r, engine: 'ddg' as const }));
    if (results.length === 0) {
      // DDG returned no parseable results (anti-bot interstitial or layout change).
      await logIssue({
        kind: 'difficulty',
        tool: 'browser_search',
        note: `DDG HTML parser ${DDG_HTML_PARSER_VERSION} returned 0 results — endpoint layout may have changed or bot-detection triggered`,
        context: { htmlLen: html.length, query },
      });
      return await bingSearch(query, maxResults);
    }
    return results;
  } catch (err) {
    // HTTP failure or parse crash — try Bing as a fallback.
    try {
      const bing = await bingSearch(query, maxResults);
      if (bing.length > 0) return bing;
      throw new Error(`Both DDG and Bing returned 0 results. The scraped HTML layouts may have changed. ` +
        `Original DDG error: ${(err as Error).message}. ` +
        `Set BROWSE_MCP_BRAVE_API_KEY for a supported API-based fallback.`);
    } catch (bingErr) {
      // Re-throw a combined error so the agent sees both causes.
      throw new Error(
        `Search failed on all providers. DDG: ${(err as Error).message}; ` +
        `Bing: ${(bingErr as Error).message}. ` +
        `These providers use unofficial HTML endpoints and may have changed layout. ` +
        `Set BROWSE_MCP_BRAVE_API_KEY for a supported API-based fallback.`
      );
    }
  }
}

export async function duckDuckGoNewsSearch(
  query: string,
  maxResults = 10,
  region?: string
): Promise<NewsResult[]> {
  // The html.duckduckgo.com endpoint does not return timestamped news blocks
  // (same result__* layout, no dates), so use the JSON news.js endpoint which
  // returns proper news items with `relative_time`, `source`, and `excerpt`.
  // Parser version: see DDG_NEWS_PARSER_VERSION above.
  try {
    const vqd = await getVqd(query);
    const kl = region || 'us-en';
    const u = new URL('https://duckduckgo.com/news.js');
    u.searchParams.set('l', kl);
    u.searchParams.set('o', 'json');
    u.searchParams.set('q', query);
    u.searchParams.set('noamp', '1');
    u.searchParams.set('vqd', vqd);
    const res = await fetch(u.toString(), {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://duckduckgo.com/',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!res.ok) throw new Error(`DuckDuckGo news HTTP ${res.status}`);
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`DuckDuckGo news: non-JSON response (len=${text.length}) — endpoint layout may have changed`);
    }
    const out: NewsResult[] = [];
    for (const r of data.results || []) {
      if (out.length >= maxResults) break;
      out.push({
        title: stripTags(String(r.title || '')).trim(),
        url: String(r.url || ''),
        snippet: stripTags(String(r.excerpt || '')).trim(),
        source: r.source ? String(r.source) : undefined,
        date: r.relative_time ? String(r.relative_time) : undefined,
      });
    }
    if (out.length === 0) {
      await logIssue({
        kind: 'difficulty',
        tool: 'browser_search_news',
        note: `DDG news parser ${DDG_NEWS_PARSER_VERSION} returned 0 results — JSON shape may have changed`,
        context: { rawResults: Array.isArray(data.results) ? data.results.length : 'missing', query },
      });
    }
    return out;
  } catch (err) {
    throw new Error(
      `News search failed: ${(err as Error).message}. ` +
      `This uses an unofficial DDG JSON endpoint that can break when the site changes. ` +
      `No stable free news-API fallback is wired in; consider browser_search with the query + "news".`
    );
  }
}

export async function duckDuckGoImageSearch(
  query: string,
  maxResults = 20,
  safeSearch: 'strict' | 'moderate' | 'off' = 'moderate'
): Promise<ImageResult[]> {
  // Parser version: see DDG_IMAGES_PARSER_VERSION above.
  try {
    const vqd = await getVqd(query);
    const p = safeSearch === 'strict' ? '1' : safeSearch === 'off' ? '-1' : '0';
    const u = new URL('https://duckduckgo.com/i.js');
    u.searchParams.set('l', 'us-en');
    u.searchParams.set('o', 'json');
    u.searchParams.set('q', query);
    u.searchParams.set('p', p);
    u.searchParams.set('v7exp', 'a');
    u.searchParams.set('vqd', vqd);
    const res = await fetch(u.toString(), {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://duckduckgo.com/',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!res.ok) throw new Error(`DuckDuckGo images HTTP ${res.status}`);
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`DuckDuckGo images: non-JSON response (len=${text.length}) — endpoint layout may have changed`);
    }
    const out: ImageResult[] = [];
    for (const r of data.results || []) {
      if (out.length >= maxResults) break;
      out.push({
        title: decodeEntities(String(r.title || '')),
        image: String(r.image || ''),
        thumbnail: String(r.thumbnail || ''),
        url: String(r.url || ''),
        width: Number(r.width || 0),
        height: Number(r.height || 0),
        source: String(r.source || ''),
      });
    }
    if (out.length === 0) {
      await logIssue({
        kind: 'difficulty',
        tool: 'browser_search_images',
        note: `DDG images parser ${DDG_IMAGES_PARSER_VERSION} returned 0 results — JSON shape may have changed`,
        context: { rawResults: Array.isArray(data.results) ? data.results.length : 'missing', query },
      });
    }
    return out;
  } catch (err) {
    throw new Error(
      `Image search failed: ${(err as Error).message}. ` +
      `This uses an unofficial DDG JSON endpoint (needs a vqd token) that can break when the site changes.`
    );
  }
}

// --- Brave Search API (opt-in) ----------------------------------------------
// Free tier: 1 req/s, 2000/mo. Docs: https://api.search.brave.com/app/documentation
// Triggered only when BROWSE_MCP_BRAVE_API_KEY is set.

async function braveSearch(query: string, maxResults: number, key: string): Promise<SearchResult[]> {
  const u = new URL('https://api.search.brave.com/res/v1/web/search');
  u.searchParams.set('q', query);
  u.searchParams.set('count', String(Math.min(maxResults, 20)));
  const res = await fetch(u.toString(), {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': key,
    },
  });
  if (!res.ok) throw new Error(`Brave API HTTP ${res.status}`);
  const data: any = await res.json();
  const items: any[] = data?.web?.results || [];
  const out: SearchResult[] = [];
  for (const r of items) {
    if (out.length >= maxResults) break;
    const title = stripTags(String(r.title || '')).trim();
    const url = String(r.url || '');
    if (!title || !url) continue;
    out.push({
      title,
      url,
      snippet: stripTags(String(r.description || '')).trim(),
      engine: 'brave',
    });
  }
  return out;
}

async function getVqd(query: string): Promise<string> {
  const u = 'https://duckduckgo.com/?q=' + encodeURIComponent(query);
  const res = await fetch(u, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`vqd lookup HTTP ${res.status}`);
  const html = await res.text();
  // Formats seen: vqd="4-123...", vqd='4-123...', vqd=4-123..., or vqd%3D4-123
  const m =
    html.match(/vqd=["']([\d-]+)["']/) ||
    html.match(/vqd=([\d-]{10,})/) ||
    html.match(/&vqd=([\d-]+)/);
  if (!m || !m[1]) {
    throw new Error('Failed to extract vqd token from DuckDuckGo — the site layout may have changed.');
  }
  return m[1];
}

async function bingSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const u = 'https://www.bing.com/search?q=' + encodeURIComponent(query);
  const res = await fetch(u, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.bing.com/',
    },
  });
  if (!res.ok) throw new Error(`Bing HTTP ${res.status}`);
  const html = await res.text();
  const results = parseBingResults(html, maxResults);
  if (results.length === 0) {
    await logIssue({
      kind: 'difficulty',
      tool: 'browser_search',
      note: `Bing HTML parser ${BING_HTML_PARSER_VERSION} returned 0 results — b_algo selector may have changed or bot-detection triggered`,
      context: { htmlLen: html.length, query },
    });
  }
  return results;
}

export function parseBingResults(html: string, max: number): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  const liRe = /<li class="b_algo"[\s\S]*?<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) && out.length < max) {
    const blk = m[0];
    const h2 = blk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (!h2) continue;
    const hrefM = h2[1].match(/<a[^>]*\bhref="([^"]+)"/);
    if (!hrefM) continue;
    const title = stripTags(h2[1]).trim();
    const rawHref = decodeEntities(hrefM[1]);
    const url = unwrapBingRedirect(rawHref);
    if (!url || !title) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    // Snippet: prefer b_caption > p, then p.b_lineclamp*, then b_caption text.
    let snippet = '';
    const cap = blk.match(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/);
    if (cap) {
      const p = cap[1].match(/<p[^>]*>([\s\S]*?)<\/p>/);
      snippet = p ? stripTags(p[1]).trim() : stripTags(cap[1]).trim();
    } else {
      const p = blk.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/);
      if (p) snippet = stripTags(p[1]).trim();
    }
    out.push({ title, url, snippet, engine: 'bing' });
  }
  return out;
}

export function unwrapBingRedirect(href: string): string {
  // Bing wraps in https://www.bing.com/ck/a?...&u=a1<base64url-of-real-url>&...
  try {
    const u = new URL(href, 'https://www.bing.com/');
    if (u.hostname.endsWith('bing.com') && u.pathname === '/ck/a') {
      const uParam = u.searchParams.get('u');
      if (uParam && uParam.startsWith('a1')) {
        const b64 = uParam.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
        try {
          const decoded = Buffer.from(b64 + pad, 'base64').toString('utf8');
          if (/^https?:\/\//i.test(decoded)) return decoded;
        } catch { /* fall through */ }
      }
    }
    return u.toString();
  } catch {
    return href;
  }
}

export function parseResults(html: string, max: number): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  // Anchor on each title link; look ahead a bounded window for its snippet.
  const titleRe =
    /<a[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) && out.length < max) {
    const rawHref = decodeEntities(m[1]);
    const title = stripTags(m[2]).trim();
    const url = unwrapDdgRedirect(rawHref);
    if (!url || !title) continue;
    // Skip DDG-served sponsored links (y.js redirector w/ ad_domain).
    if (/duckduckgo\.com\/y\.js\?.*\bad_domain=/.test(rawHref)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    // Look ahead up to 4KB for this result's snippet.
    const tail = html.slice(m.index + m[0].length, m.index + m[0].length + 4000);
    const snipMatch =
      tail.match(/<(?:a|div)[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/);
    const snippet = snipMatch ? stripTags(snipMatch[1]).trim() : '';

    out.push({ title, url, snippet });
  }
  return out;
}

export function unwrapDdgRedirect(href: string): string {
  // DDG wraps results: //duckduckgo.com/l/?uddg=<encoded>&rut=...
  try {
    const abs = href.startsWith('//') ? 'https:' + href : href;
    const u = new URL(abs);
    if (u.hostname.endsWith('duckduckgo.com') && u.pathname === '/l/') {
      const target = u.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    }
    return abs;
  } catch {
    return href;
  }
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''));
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return '(no results)';
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join('\n\n');
}

export function formatNewsResults(results: NewsResult[]): string {
  if (results.length === 0) return '(no results)';
  return results
    .map((r, i) => {
      const meta = [r.source, r.date].filter(Boolean).join(' · ');
      return `${i + 1}. ${r.title}${meta ? `  [${meta}]` : ''}\n   ${r.url}\n   ${r.snippet}`;
    })
    .join('\n\n');
}
