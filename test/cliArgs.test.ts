import { describe, it, expect } from 'vitest';
import { parseCliArgs, numFlag, CLI_COMMANDS } from '../src/cliArgs.js';

describe('parseCliArgs', () => {
  it('splits command, positionals, and value flags', () => {
    const c = parseCliArgs(['read', 'https://x.com/a', '--format', 'json', '--max-pages', '3']);
    expect(c.cmd).toBe('read');
    expect(c.positional).toEqual(['https://x.com/a']);
    expect(c.flags).toEqual({ format: 'json', 'max-pages': '3' });
  });

  it('boolean flags never consume the following positional', () => {
    const c = parseCliArgs(['search', '--news', 'crosstie', 'prices']);
    expect(c.flags.news).toBe(true);
    expect(c.positional).toEqual(['crosstie', 'prices']);
  });

  it('supports --flag=value form', () => {
    const c = parseCliArgs(['research', 'q', '--max=3', '--format=text']);
    expect(c.flags).toEqual({ max: '3', format: 'text' });
  });

  it('value flag at end of argv becomes boolean instead of swallowing nothing', () => {
    const c = parseCliArgs(['search', 'q', '--region']);
    expect(c.flags.region).toBe(true);
  });

  it('multi-word queries stay as separate positionals for joining', () => {
    const c = parseCliArgs(['search', 'used', 'toyota', 'sienna', '--max', '5']);
    expect(c.positional.join(' ')).toBe('used toyota sienna');
    expect(c.flags.max).toBe('5');
  });
});

describe('numFlag', () => {
  it('parses numeric strings, rejects booleans and garbage', () => {
    expect(numFlag('25')).toBe(25);
    expect(numFlag(true)).toBeUndefined();
    expect(numFlag(undefined)).toBeUndefined();
    expect(numFlag('abc')).toBeUndefined();
  });
});

describe('CLI_COMMANDS', () => {
  it('covers the dispatch set', () => {
    for (const c of ['read', 'search', 'research', 'help', '--help', '-h']) {
      expect(CLI_COMMANDS.has(c)).toBe(true);
    }
    expect(CLI_COMMANDS.has('navigate')).toBe(false);
  });
});
