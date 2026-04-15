// DuckDuckGo HTML-endpoint search. No JS, no API key, no browser launch.
// Endpoint returns server-rendered HTML we can regex-parse for top results.

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: 'ddg' | 'bing';
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

export async function duckDuckGoSearch(
  query: string,
  maxResults = 10,
  region?: string
): Promise<SearchResult[]> {
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
      // DDG returned no parseable results (e.g. anti-bot interstitial); try Bing.
      return await bingSearch(query, maxResults);
    }
    return results;
  } catch (err) {
    // HTTP failure or parse crash — try Bing as a fallback.
    try {
      return await bingSearch(query, maxResults);
    } catch {
      // Re-throw the original DDG error if Bing also fails.
      throw err;
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
    throw new Error(`DuckDuckGo news: non-JSON response (len=${text.length})`);
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
  return out;
}

export async function duckDuckGoImageSearch(
  query: string,
  maxResults = 20,
  safeSearch: 'strict' | 'moderate' | 'off' = 'moderate'
): Promise<ImageResult[]> {
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
    throw new Error(`DuckDuckGo images: non-JSON response (len=${text.length})`);
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
  return parseBingResults(html, maxResults);
}

function parseBingResults(html: string, max: number): SearchResult[] {
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

function unwrapBingRedirect(href: string): string {
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

function parseResults(html: string, max: number): SearchResult[] {
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

function unwrapDdgRedirect(href: string): string {
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

function decodeEntities(s: string): string {
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
