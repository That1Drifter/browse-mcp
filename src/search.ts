// DuckDuckGo HTML-endpoint search. No JS, no API key, no browser launch.
// Endpoint returns server-rendered HTML we can regex-parse for top results.

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
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
  return parseResults(html, maxResults);
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
