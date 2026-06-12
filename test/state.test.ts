import { describe, it, expect } from 'vitest';
import { sep } from 'path';
import { resolveStatePath, validateStorageState, summarizeState } from '../src/state.js';

describe('resolveStatePath', () => {
  it('defaults to default.json in the state dir', () => {
    expect(resolveStatePath({})).toMatch(new RegExp(`state\\${sep}default\\.json$`));
  });

  it('uses the given name', () => {
    expect(resolveStatePath({ name: 'work-acct' })).toMatch(/work-acct\.json$/);
  });

  it('explicit path wins over name', () => {
    expect(resolveStatePath({ name: 'x', path: 'C:/tmp/s.json' })).toBe('C:/tmp/s.json');
  });

  it('rejects names with path separators or traversal', () => {
    expect(() => resolveStatePath({ name: '../etc/passwd' })).toThrow(/Invalid state name/);
    expect(() => resolveStatePath({ name: 'a/b' })).toThrow(/Invalid state name/);
    expect(() => resolveStatePath({ name: 'a\\b' })).toThrow(/Invalid state name/);
  });
});

describe('validateStorageState', () => {
  it('accepts a Playwright-shaped state', () => {
    const s = validateStorageState({
      cookies: [{ name: 'sid', value: 'x', domain: 'example.com', path: '/' }],
      origins: [{ origin: 'https://example.com', localStorage: [{ name: 'k', value: 'v' }] }],
    });
    expect(s.cookies).toHaveLength(1);
    expect(s.origins).toHaveLength(1);
  });

  it('tolerates a missing origins or cookies array', () => {
    expect(validateStorageState({ cookies: [] }).origins).toEqual([]);
    expect(validateStorageState({ origins: [] }).cookies).toEqual([]);
  });

  it('rejects non-objects and non-state JSON', () => {
    expect(() => validateStorageState(null)).toThrow();
    expect(() => validateStorageState('hi')).toThrow();
    expect(() => validateStorageState({ foo: 1 })).toThrow(/neither/);
    expect(() =>
      validateStorageState({ cookies: [], origins: [{ origin: 5, localStorage: [] }] }),
    ).toThrow(/Malformed/);
  });
});

describe('summarizeState', () => {
  it('counts cookies, origins, and items', () => {
    const out = summarizeState({
      cookies: [{}, {}],
      origins: [
        { origin: 'https://a.com', localStorage: [{ name: 'x', value: '1' }] },
        {
          origin: 'https://b.com',
          localStorage: [
            { name: 'y', value: '2' },
            { name: 'z', value: '3' },
          ],
        },
      ],
    });
    expect(out).toBe('2 cookie(s), 2 origin(s) with 3 localStorage item(s)');
  });
});
