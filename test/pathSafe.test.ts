import { describe, it, expect } from 'vitest';
import { resolve, join, sep } from 'path';
import { confineToDir, safeBasename } from '../src/pathSafe.js';

const ROOT = resolve('srv', 'app', 'downloads');

describe('confineToDir', () => {
  it('returns the resolved root when nothing is requested', () => {
    expect(confineToDir(ROOT)).toBe(ROOT);
    expect(confineToDir(ROOT, '')).toBe(ROOT);
  });

  it('allows a relative subdirectory under the root', () => {
    expect(confineToDir(ROOT, 'invoices')).toBe(join(ROOT, 'invoices'));
    expect(confineToDir(ROOT, 'a/b/c')).toBe(join(ROOT, 'a', 'b', 'c'));
  });

  it('normalizes harmless interior ".." that stays inside', () => {
    expect(confineToDir(ROOT, 'a/../b')).toBe(join(ROOT, 'b'));
  });

  it('allows an absolute path that is already inside the root', () => {
    const inside = join(ROOT, 'sub', 'file.bin');
    expect(confineToDir(ROOT, inside)).toBe(inside);
  });

  it('rejects ".." traversal that escapes the root', () => {
    expect(() => confineToDir(ROOT, '../../etc/passwd')).toThrow(/outside the allowed directory/);
    expect(() => confineToDir(ROOT, '..')).toThrow(/outside the allowed directory/);
  });

  it('rejects an absolute path outside the root', () => {
    // Absolute on POSIX; drive-relative-absolute (outside ROOT) on Windows.
    expect(() => confineToDir(ROOT, `${sep}etc${sep}passwd`)).toThrow(
      /outside the allowed directory/,
    );
  });

  it('does not treat a sibling with the same prefix as inside', () => {
    // ROOT is ".../downloads"; ".../downloads-evil" must not pass the check.
    expect(() => confineToDir(ROOT, join('..', 'downloads-evil', 'x'))).toThrow(
      /outside the allowed directory/,
    );
  });
});

describe('safeBasename', () => {
  it('passes a plain filename through', () => {
    expect(safeBasename('report.pdf')).toBe('report.pdf');
    expect(safeBasename('.bashrc')).toBe('.bashrc');
  });

  it('strips POSIX and Windows directory components', () => {
    expect(safeBasename('/etc/cron.d/evil')).toBe('evil');
    expect(safeBasename('../../.bashrc')).toBe('.bashrc');
    expect(safeBasename('a\\b\\c.txt')).toBe('c.txt');
    expect(safeBasename('C:\\Windows\\system32\\drivers\\etc\\hosts')).toBe('hosts');
  });

  it('returns empty for names that resolve to no real basename', () => {
    expect(safeBasename('')).toBe('');
    expect(safeBasename('..')).toBe('');
    expect(safeBasename('.')).toBe('');
    expect(safeBasename('foo/..')).toBe('');
    expect(safeBasename('/')).toBe('');
  });
});
