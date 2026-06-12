import { describe, it, expect } from 'vitest';
import { looksLikeChallenge, formatPageContext, HANDOFF_HINT } from '../src/pageContext.js';

describe('looksLikeChallenge', () => {
  it('flags challenge URLs regardless of content', () => {
    expect(looksLikeChallenge('https://x.com/cdn-cgi/challenge', 'Anything', 'normal text')).toBe(
      true,
    );
    expect(looksLikeChallenge('https://x.com/static-pages/418', '', '')).toBe(true);
  });

  it('flags Cloudflare interstitial titles', () => {
    expect(looksLikeChallenge('https://x.com/', 'Just a moment...', '')).toBe(true);
    expect(looksLikeChallenge('https://x.com/', '', 'Checking your browser before accessing')).toBe(
      true,
    );
    expect(looksLikeChallenge('https://x.com/', '', 'Verify you are human')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(looksLikeChallenge('https://x.com/', 'JUST A MOMENT', '')).toBe(true);
  });

  it('passes ordinary pages', () => {
    expect(
      looksLikeChallenge(
        'https://en.wikipedia.org/wiki/Tea',
        'Tea - Wikipedia',
        'Tea is an aromatic beverage prepared by pouring hot water over leaves',
      ),
    ).toBe(false);
  });
});

describe('formatPageContext', () => {
  it('includes url, readyState, title, and excerpt', () => {
    const out = formatPageContext({
      url: 'https://example.com/a',
      title: 'Example',
      readyState: 'complete',
      excerpt: 'Hello world',
    });
    expect(out).toContain('https://example.com/a');
    expect(out).toContain('readyState=complete');
    expect(out).toContain('Title: Example');
    expect(out).toContain('Body starts: Hello world');
    expect(out).not.toContain(HANDOFF_HINT);
  });

  it('appends the handoff hint on challenge pages', () => {
    const out = formatPageContext({
      url: 'https://example.com/a',
      title: 'Just a moment...',
      readyState: 'interactive',
      excerpt: 'Verifying you are human. This may take a few seconds.',
    });
    expect(out).toContain(HANDOFF_HINT);
  });

  it('omits empty title and excerpt lines', () => {
    const out = formatPageContext({
      url: 'https://example.com/a',
      title: '',
      readyState: 'unknown',
      excerpt: '',
    });
    expect(out).not.toContain('Title:');
    expect(out).not.toContain('Body starts:');
  });
});
