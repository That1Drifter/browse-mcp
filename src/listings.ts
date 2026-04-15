import type { Page } from 'playwright';

export interface ExtractOptions {
  hrefPattern?: string;       // substring OR /regex/ (wrapped in slashes)
  requireText?: string;       // case-insensitive substring that must appear in anchor text
  containerSelector?: string; // scope search to inside this CSS selector
}

export interface Listing {
  href: string;
  title: string;
  text: string;
  year: number | null;
  price: string | null;
  distanceMi: number | null;
  location: string | null;
  imageUrl: string | null;
  isNew: boolean;
  isUsed: boolean;
}

// In-page collector: finds all anchors in scope, pierces shadow DOM, groups by
// href, picks the one with longest textContent (richest data). Filters by the
// provided href pattern and optional required text.
const COLLECT_FN = `(opts) => {
  const { hrefPattern, requireText, containerSelector } = opts;

  // Build href matcher (string substring OR /regex/)
  let hrefTest;
  if (hrefPattern) {
    if (hrefPattern.length > 2 && hrefPattern.startsWith('/') && hrefPattern.lastIndexOf('/') > 0) {
      const last = hrefPattern.lastIndexOf('/');
      const body = hrefPattern.slice(1, last);
      const flags = hrefPattern.slice(last + 1);
      hrefTest = (h) => new RegExp(body, flags).test(h || '');
    } else {
      hrefTest = (h) => (h || '').includes(hrefPattern);
    }
  } else {
    hrefTest = () => true;
  }

  const textTest = requireText
    ? (t) => t.toLowerCase().includes(requireText.toLowerCase())
    : () => true;

  // Collect all anchors from main doc + shadow roots, scoped if requested
  const rootEls = containerSelector
    ? Array.from(document.querySelectorAll(containerSelector))
    : [document.documentElement];

  const anchors = [];
  for (const root of rootEls) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (n && n.nodeType === 1) {
        if (n.tagName === 'A') anchors.push(n);
        if (n.children) for (const c of Array.from(n.children)) stack.push(c);
        if (n.shadowRoot) for (const c of Array.from(n.shadowRoot.children)) stack.push(c);
      }
    }
  }

  // Group by href, pick longest-text element
  const byHref = new Map();
  for (const a of anchors) {
    const rawHref = a.getAttribute('href') || '';
    const href = a.href || rawHref;
    if (!hrefTest(rawHref) && !hrefTest(href)) continue;
    const text = (a.textContent || '').replace(/\\s+/g, ' ').trim();
    const prev = byHref.get(href);
    if (!prev || text.length > prev.text.length) byHref.set(href, { el: a, text });
  }

  // Build output with structured parsing
  const listings = [];
  for (const [href, { el, text }] of byHref.entries()) {
    if (!textTest(text)) continue;

    const yearMatch = text.match(/\\b(19|20)\\d{2}\\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const priceMatch = text.match(/\\$[\\d,]+(?:\\.\\d{2})?/);
    const distMatch = text.match(/\\((\\d+(?:\\.\\d+)?)\\s*mi\\)/i) || text.match(/\\b(\\d+(?:\\.\\d+)?)\\s*mi(?:les?)?\\b/i);
    const locMatch = text.match(/\\b([A-Z][A-Za-z]+(?:\\s[A-Z][A-Za-z]+)*),\\s*([A-Z]{2})\\b/);
    const imgEl = el.querySelector ? el.querySelector('img') : null;
    const imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || null) : null;
    const isNew = /\\bNew\\b/.test(' ' + text + ' ') && !/Used|Pre-?owned/i.test(text);
    const isUsed = /\\bUsed\\b|Pre-?owned/i.test(text);

    // Prefer explicit title span if present (common on listing cards)
    const titleSpan = el.querySelector ? el.querySelector('[class*="title"], [title]') : null;
    const title = titleSpan
      ? (titleSpan.getAttribute('title') || titleSpan.textContent || '').replace(/\\s+/g, ' ').trim()
      : text.slice(0, 100);

    listings.push({
      href,
      title,
      text: text.slice(0, 500),
      year,
      price: priceMatch ? priceMatch[0] : null,
      distanceMi: distMatch ? parseFloat(distMatch[1]) : null,
      location: locMatch ? locMatch[1] + ', ' + locMatch[2] : null,
      imageUrl,
      isNew,
      isUsed,
    });
  }
  return listings;
}`;

export async function extractListings(page: Page, opts: ExtractOptions = {}): Promise<Listing[]> {
  const result = (await page.evaluate(
    `(${COLLECT_FN})(${JSON.stringify(opts)})`
  )) as Listing[];
  return result;
}
