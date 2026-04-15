import { describe, it, expect } from 'vitest';
import { renderTree, parseRef } from '../src/snapshot.js';

describe('parseRef', () => {
  it('parses a plain local ref as frame 0', () => {
    const r = parseRef('e5');
    expect(r.frameIdx).toBe(0);
    expect(r.local).toBe('e5');
  });

  it('parses a frame-prefixed ref', () => {
    const r = parseRef('f2e7');
    expect(r.frameIdx).toBe(2);
    expect(r.local).toBe('e7');
  });

  it('strips a leading @ sigil', () => {
    const r = parseRef('@f3e9');
    expect(r.frameIdx).toBe(3);
    expect(r.local).toBe('e9');
  });
});

describe('renderTree', () => {
  it('renders a simple node with role and name', () => {
    const tree = { role: 'button', name: 'Submit', ref: 'e1', interactive: true };
    const out = renderTree(tree);
    expect(out).toContain('@e1');
    expect(out).toContain('[button]');
    expect(out).toContain('"Submit"');
  });

  it('indents children by depth', () => {
    const tree = {
      role: 'main',
      children: [
        { role: 'heading', name: 'Title', tag: 'H2' },
        { role: 'paragraph', name: 'Hello' },
      ],
    };
    const out = renderTree(tree);
    const lines = out.split('\n');
    expect(lines[0]).toMatch(/^\[main\]/);
    expect(lines[1]).toMatch(/^  /);
    expect(out).toContain('level=2');
  });

  it('collapses a chain of single-child generic wrappers', () => {
    const tree = {
      role: 'generic',
      children: [
        {
          role: 'generic',
          children: [
            { role: 'button', name: 'Click', ref: 'e1', interactive: true },
          ],
        },
      ],
    };
    const out = renderTree(tree);
    const lines = out.split('\n').filter(Boolean);
    // Should collapse all generics and render just the button at depth 0
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^@e1 \[button\]/);
  });

  it('does NOT collapse when noCollapse=true', () => {
    const tree = {
      role: 'generic',
      children: [
        { role: 'generic', children: [{ role: 'button', name: 'X', interactive: true }] },
      ],
    };
    const out = renderTree(tree, { noCollapse: true });
    expect(out.split('\n').filter(Boolean).length).toBeGreaterThan(1);
  });

  it('with interactive=true hides non-interactive branches with no interactive descendants', () => {
    const tree = {
      role: 'main',
      children: [
        { role: 'paragraph', name: 'just text' },
        { role: 'button', name: 'Click', ref: 'e1', interactive: true },
      ],
    };
    const out = renderTree(tree, { interactive: true });
    expect(out).toContain('[button]');
    expect(out).not.toContain('just text');
  });

  it('respects maxDepth', () => {
    const tree = {
      role: 'a', children: [
        { role: 'b', children: [
          { role: 'c', children: [{ role: 'd' }] },
        ]},
      ],
    };
    const out = renderTree(tree, { maxDepth: 1, noCollapse: true });
    expect(out).toContain('[a]');
    expect(out).toContain('[b]');
    expect(out).not.toContain('[c]');
    expect(out).not.toContain('[d]');
  });
});
