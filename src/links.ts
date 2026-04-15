import type { Page, Frame } from 'playwright';

export interface LinksOptions {
  hrefPattern?: string;        // substring OR /regex/flags literal
  textPattern?: string;        // case-insensitive substring
  sameOriginOnly?: boolean;
  max?: number;
}

export interface LinkInfo {
  text: string;
  href: string;
  ref?: string;
}

// In-page collector. Pierces shadow DOM. Same-origin iframes are handled
// separately at the Playwright level via page.frames().
const COLLECT_FN = `(opts) => {
  const { hrefPattern, textPattern, sameOriginOnly, framePrefix, pageOrigin } = opts;

  let hrefTest;
  if (hrefPattern) {
    if (hrefPattern.length > 2 && hrefPattern.startsWith('/') && hrefPattern.lastIndexOf('/') > 0) {
      const last = hrefPattern.lastIndexOf('/');
      const body = hrefPattern.slice(1, last);
      const flags = hrefPattern.slice(last + 1);
      try {
        const rx = new RegExp(body, flags);
        hrefTest = (h) => rx.test(h || '');
      } catch (_e) {
        hrefTest = (h) => (h || '').includes(hrefPattern);
      }
    } else {
      hrefTest = (h) => (h || '').includes(hrefPattern);
    }
  } else {
    hrefTest = () => true;
  }

  const textTest = textPattern
    ? (t) => t.toLowerCase().includes(String(textPattern).toLowerCase())
    : () => true;

  const anchors = [];
  const stack = [document.documentElement];
  while (stack.length) {
    const n = stack.pop();
    if (n && n.nodeType === 1) {
      if (n.tagName === 'A') anchors.push(n);
      if (n.children) for (const c of Array.from(n.children)) stack.push(c);
      if (n.shadowRoot) for (const c of Array.from(n.shadowRoot.children)) stack.push(c);
    }
  }

  const out = [];
  for (const a of anchors) {
    const rawHref = a.getAttribute('href');
    if (!rawHref) continue;
    let href;
    try { href = new URL(rawHref, document.baseURI).href; } catch { continue; }
    if (!hrefTest(href)) continue;
    if (sameOriginOnly) {
      try {
        const u = new URL(href);
        if (u.origin !== pageOrigin) continue;
      } catch { continue; }
    }
    // Fallback chain: visible text → aria-label → title → alt of nested img.
    let text = (a.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text) text = (a.getAttribute('aria-label') || '').trim();
    if (!text) text = (a.getAttribute('title') || '').trim();
    if (!text) {
      const img = a.querySelector && a.querySelector('img[alt]');
      if (img) text = (img.getAttribute('alt') || '').trim();
    }
    text = text.slice(0, 120);
    if (!textTest(text)) continue;
    const ref = a.getAttribute('data-browse-ref') || undefined;
    const entry = { text, href };
    if (ref) entry.ref = framePrefix ? (ref) : ref;
    out.push(entry);
  }
  return out;
}`;

export async function collectLinks(page: Page, opts: LinksOptions): Promise<LinkInfo[]> {
  const max = opts.max ?? 200;
  const frames = page.frames();
  const mainOrigin = await page.evaluate(() => location.origin);
  const out: LinkInfo[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < frames.length; i++) {
    if (out.length >= max) break;
    const frame = frames[i];
    const framePrefix = i === 0 ? '' : `f${i}`;
    // Skip cross-origin iframes — evaluate would throw anyway, but be explicit.
    if (i !== 0) {
      try {
        const url = frame.url();
        if (url && url !== 'about:blank') {
          const u = new URL(url);
          if (u.origin !== mainOrigin) continue;
        }
      } catch { continue; }
    }
    let items: LinkInfo[] = [];
    try {
      items = await frame.evaluate(
        `(${COLLECT_FN})(${JSON.stringify({
          hrefPattern: opts.hrefPattern,
          textPattern: opts.textPattern,
          sameOriginOnly: !!opts.sameOriginOnly,
          framePrefix,
          pageOrigin: mainOrigin,
        })})`
      ) as LinkInfo[];
    } catch {
      continue;
    }
    for (const it of items) {
      if (out.length >= max) break;
      const key = `${framePrefix}::${it.href}::${it.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Prefix ref with frame index if applicable
      if (it.ref && framePrefix) it.ref = framePrefix + it.ref;
      out.push(it);
    }
  }
  return out;
}
