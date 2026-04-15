import { describe, it, expect } from 'vitest';
import {
  parseResults,
  parseBingResults,
  unwrapDdgRedirect,
  unwrapBingRedirect,
  decodeEntities,
  formatResults,
  formatNewsResults,
} from '../src/search.js';

describe('decodeEntities', () => {
  it('decodes common named entities', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeEntities('&quot;hi&quot;')).toBe('"hi"');
    expect(decodeEntities('&lt;b&gt;')).toBe('<b>');
    expect(decodeEntities('it&#39;s')).toBe("it's");
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
  });
  it('decodes numeric entities', () => {
    expect(decodeEntities('&#65;&#x42;')).toBe('AB');
  });
});

describe('unwrapDdgRedirect', () => {
  it('extracts uddg target from a DDG /l/ URL', () => {
    const href = '//duckduckgo.com/l/?uddg=' + encodeURIComponent('https://example.com/x?y=1') + '&rut=abc';
    expect(unwrapDdgRedirect(href)).toBe('https://example.com/x?y=1');
  });
  it('passes direct URLs through unchanged', () => {
    expect(unwrapDdgRedirect('https://example.com/foo')).toBe('https://example.com/foo');
  });
  it('falls back to original on parse errors', () => {
    // not a URL-like string; function catches and returns href
    const junk = 'not a url %%%';
    expect(unwrapDdgRedirect(junk)).toBe(junk);
  });
});

describe('unwrapBingRedirect', () => {
  it('decodes a bing ck/a base64url u-param', () => {
    const real = 'https://example.org/page?x=1';
    const b64 = Buffer.from(real, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const href = `https://www.bing.com/ck/a?!&&p=abc&u=a1${b64}&ntb=1`;
    expect(unwrapBingRedirect(href)).toBe(real);
  });
  it('returns non-redirect URLs as-is (normalized)', () => {
    expect(unwrapBingRedirect('https://example.com/')).toBe('https://example.com/');
  });
});

describe('parseResults (DDG HTML)', () => {
  it('parses multiple result blocks with titles, urls, snippets', () => {
    const realUrl1 = 'https://example.com/a';
    const realUrl2 = 'https://example.org/b';
    const href1 = '//duckduckgo.com/l/?uddg=' + encodeURIComponent(realUrl1);
    const href2 = '//duckduckgo.com/l/?uddg=' + encodeURIComponent(realUrl2);
    const html = `
      <div class="result">
        <a class="result__a" href="${href1}">First &amp; Best</a>
        <a class="result__snippet" href="x">The <b>first</b> result snippet.</a>
      </div>
      <div class="result">
        <a class="result__a" href="${href2}">Second</a>
        <div class="result__snippet">Snippet two.</div>
      </div>
    `;
    const results = parseResults(html, 10);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'First & Best',
      url: realUrl1,
      snippet: 'The first result snippet.',
    });
    expect(results[1]).toMatchObject({
      title: 'Second',
      url: realUrl2,
      snippet: 'Snippet two.',
    });
  });

  it('respects max cap and de-dupes identical urls', () => {
    const href = '//duckduckgo.com/l/?uddg=' + encodeURIComponent('https://dup.example/');
    const block = `<a class="result__a" href="${href}">Title</a>
      <div class="result__snippet">S</div>`;
    const html = block + block + block;
    expect(parseResults(html, 10)).toHaveLength(1);

    // Max cap
    const hrefs = [1, 2, 3].map(
      (i) => '//duckduckgo.com/l/?uddg=' + encodeURIComponent('https://e.example/' + i)
    );
    const manyHtml = hrefs.map(
      (h, i) => `<a class="result__a" href="${h}">T${i}</a><div class="result__snippet">s</div>`
    ).join('\n');
    expect(parseResults(manyHtml, 2)).toHaveLength(2);
  });

  it('skips sponsored y.js ad_domain links', () => {
    const ad = '//duckduckgo.com/y.js?ad_domain=ads.example&u=https://ads.example/';
    const real = '//duckduckgo.com/l/?uddg=' + encodeURIComponent('https://real.example/');
    const html =
      `<a class="result__a" href="${ad}">Ad</a><div class="result__snippet">s</div>` +
      `<a class="result__a" href="${real}">Real</a><div class="result__snippet">s</div>`;
    const r = parseResults(html, 10);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe('https://real.example/');
  });
});

describe('parseBingResults', () => {
  it('parses b_algo blocks with h2/caption/p', () => {
    const u = 'https://bing-result.example/foo';
    const b64 = Buffer.from(u, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const href = `https://www.bing.com/ck/a?u=a1${b64}&p=1`;
    const html = `
      <li class="b_algo">
        <h2><a href="${href.replace(/&/g, '&amp;')}">Hello &amp; World</a></h2>
        <div class="b_caption"><p>Caption snippet.</p></div>
      </li>
    `;
    const r = parseBingResults(html, 10);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      title: 'Hello & World',
      url: u,
      snippet: 'Caption snippet.',
      engine: 'bing',
    });
  });

  it('returns empty for no algo blocks', () => {
    expect(parseBingResults('<div>nothing here</div>', 10)).toEqual([]);
  });
});

describe('formatResults / formatNewsResults', () => {
  it('returns (no results) sentinel when empty', () => {
    expect(formatResults([])).toBe('(no results)');
    expect(formatNewsResults([])).toBe('(no results)');
  });

  it('numbers and formats results', () => {
    const out = formatResults([
      { title: 'A', url: 'https://a', snippet: 'x' },
      { title: 'B', url: 'https://b', snippet: 'y' },
    ]);
    expect(out).toContain('1. A');
    expect(out).toContain('2. B');
    expect(out).toContain('https://a');
  });

  it('includes source/date meta when present', () => {
    const out = formatNewsResults([
      { title: 'N', url: 'https://n', snippet: 's', source: 'Src', date: '2h ago' },
    ]);
    expect(out).toContain('[Src · 2h ago]');
  });
});
