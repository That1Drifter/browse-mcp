import { describe, it, expect } from 'vitest';
import { formatInspect, type InspectResult } from '../src/inspect.js';

function baseResult(overrides: Partial<InspectResult> = {}): InspectResult {
  return {
    selector: 'div.x',
    tagName: 'DIV',
    attributes: { id: 'main', class: 'x' },
    matchedRules: [],
    inlineStyle: {},
    computedSelected: {},
    boxModel: null,
    ...overrides,
  };
}

describe('formatInspect', () => {
  it('renders tag, attributes, and box model line', () => {
    const out = formatInspect(
      baseResult({ boxModel: { width: 100, height: 50, x: 10, y: 20 } })
    );
    expect(out).toMatch(/^div id="main" class="x"/);
    expect(out).toContain('box: 100x50 @ (10,20)');
  });

  it('includes inline style entries', () => {
    const out = formatInspect(baseResult({ inlineStyle: { color: 'red', margin: '4px' } }));
    expect(out).toContain('inline style:');
    expect(out).toContain('color: red');
    expect(out).toContain('margin: 4px');
  });

  it('suppresses longhand properties when their shorthand is declared in the same rule', () => {
    const out = formatInspect(
      baseResult({
        matchedRules: [
          {
            origin: 'author',
            selector: '.x',
            properties: [
              { name: 'margin', value: '4px' },
              { name: 'margin-top', value: '4px' },
              { name: 'margin-left', value: '4px' },
              { name: 'color', value: 'red' },
            ],
          },
        ],
      })
    );
    expect(out).toContain('margin: 4px');
    expect(out).not.toContain('margin-top');
    expect(out).not.toContain('margin-left');
    expect(out).toContain('color: red');
  });

  it('includes !important marker', () => {
    const out = formatInspect(
      baseResult({
        matchedRules: [
          {
            origin: 'author',
            selector: '.x',
            properties: [{ name: 'color', value: 'red', important: true }],
          },
        ],
      })
    );
    expect(out).toContain('color: red !important');
  });

  it('orders inline origin, then author/regular, then other (user-agent)', () => {
    const out = formatInspect(
      baseResult({
        matchedRules: [
          { origin: 'user-agent', selector: 'ua-sel', properties: [{ name: 'x', value: '1' }] },
          { origin: 'author', selector: 'author-sel', properties: [{ name: 'x', value: '2' }] },
          { origin: 'inline', selector: 'inline-sel', properties: [{ name: 'x', value: '3' }] },
        ],
      })
    );
    const inlinePos = out.indexOf('inline-sel');
    const authorPos = out.indexOf('author-sel');
    const uaPos = out.indexOf('ua-sel');
    expect(inlinePos).toBeGreaterThan(-1);
    expect(inlinePos).toBeLessThan(authorPos);
    expect(authorPos).toBeLessThan(uaPos);
  });

  it('skips noisy default computed values', () => {
    const out = formatInspect(
      baseResult({
        computedSelected: {
          display: 'block',
          opacity: '1',
          transform: 'none',
          margin: '0px',
          cursor: 'auto',
          color: 'rgb(0,0,0)',
        },
      })
    );
    expect(out).toContain('display: block');
    expect(out).toContain('color: rgb(0,0,0)');
    expect(out).not.toContain('transform: none');
    expect(out).not.toContain('margin: 0px');
    expect(out).not.toContain('cursor: auto');
  });
});
