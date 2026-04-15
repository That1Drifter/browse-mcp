import { describe, it, expect } from 'vitest';
import { unifiedDiff } from '../src/diff.js';

describe('unifiedDiff', () => {
  it('reports no changes for identical input', () => {
    expect(unifiedDiff('a\nb\nc', 'a\nb\nc')).toBe('(no changes)');
  });

  it('marks added and removed lines', () => {
    const a = 'one\ntwo\nthree';
    const b = 'one\nTWO\nthree';
    const out = unifiedDiff(a, b);
    expect(out).toMatch(/^@@ /m);
    expect(out).toContain('-two');
    expect(out).toContain('+TWO');
    expect(out).toContain(' one');
    expect(out).toContain(' three');
  });

  it('handles pure insertions', () => {
    const out = unifiedDiff('a\nb', 'a\nx\nb');
    expect(out).toContain('+x');
    expect(out).not.toMatch(/^-/m);
  });

  it('handles pure deletions', () => {
    const out = unifiedDiff('a\nx\nb', 'a\nb');
    expect(out).toContain('-x');
  });

  it('respects context argument for hunk trimming', () => {
    const a = Array.from({ length: 20 }, (_, i) => `L${i}`).join('\n');
    const b = a.replace('L10', 'CHANGED');
    const out = unifiedDiff(a, b, 1);
    // With context=1 we should see only ~1 line around the change, not 20
    expect(out.split('\n').length).toBeLessThan(10);
    expect(out).toContain('-L10');
    expect(out).toContain('+CHANGED');
  });
});
