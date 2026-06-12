import { describe, it, expect } from 'vitest';
import { parseProxyEnv, parseFenceEnv, checkUrlAllowed } from '../src/fence.js';

describe('parseProxyEnv', () => {
  it('returns undefined when unset', () => {
    expect(parseProxyEnv({})).toBeUndefined();
  });

  it('parses server, credentials, and bypass', () => {
    const p = parseProxyEnv({
      BROWSE_MCP_PROXY: 'http://user:p%40ss@proxy.example.com:8080',
      BROWSE_MCP_PROXY_BYPASS: 'localhost,*.internal',
    });
    expect(p).toEqual({
      server: 'http://proxy.example.com:8080',
      username: 'user',
      password: 'p@ss',
      bypass: 'localhost,*.internal',
    });
  });

  it('parses socks5 URLs', () => {
    expect(parseProxyEnv({ BROWSE_MCP_PROXY: 'socks5://127.0.0.1:1080' })).toEqual({
      server: 'socks5://127.0.0.1:1080',
    });
  });

  it('passes non-URL values through as-is', () => {
    expect(parseProxyEnv({ BROWSE_MCP_PROXY: 'proxy.local:3128' })).toEqual({
      server: 'proxy.local:3128',
    });
  });
});

describe('parseFenceEnv', () => {
  it('splits, trims, lowercases, drops empties', () => {
    const f = parseFenceEnv({ BROWSE_MCP_ALLOWED_ORIGINS: ' Example.com , ,docs.foo.io' });
    expect(f.allowed).toEqual(['example.com', 'docs.foo.io']);
    expect(f.blocked).toEqual([]);
  });
});

describe('checkUrlAllowed', () => {
  const cfg = (allowed: string[] = [], blocked: string[] = []) => ({ allowed, blocked });

  it('allows everything with no config', () => {
    expect(checkUrlAllowed('https://anywhere.com/x', cfg()).allowed).toBe(true);
  });

  it('allowlist permits exact host and subdomains, denies the rest', () => {
    const c = cfg(['example.com']);
    expect(checkUrlAllowed('https://example.com/a', c).allowed).toBe(true);
    expect(checkUrlAllowed('https://docs.example.com/a', c).allowed).toBe(true);
    expect(checkUrlAllowed('https://notexample.com/a', c).allowed).toBe(false);
    expect(checkUrlAllowed('https://evil.com/a', c).allowed).toBe(false);
  });

  it('blocklist wins over allowlist', () => {
    const c = cfg(['example.com'], ['ads.example.com']);
    expect(checkUrlAllowed('https://ads.example.com/x', c).allowed).toBe(false);
    expect(checkUrlAllowed('https://example.com/x', c).allowed).toBe(true);
  });

  it('strips scheme and path from entries', () => {
    const c = cfg(['https://example.com/some/path']);
    expect(checkUrlAllowed('https://example.com/other', c).allowed).toBe(true);
  });

  it('never fences non-http(s) URLs', () => {
    const c = cfg(['example.com']);
    expect(checkUrlAllowed('data:text/html,<h1>x</h1>', c).allowed).toBe(true);
    expect(checkUrlAllowed('about:blank', c).allowed).toBe(true);
  });

  it('returns a reason when blocked', () => {
    const r = checkUrlAllowed('https://evil.com/', cfg(['example.com']));
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('evil.com');
  });
});
