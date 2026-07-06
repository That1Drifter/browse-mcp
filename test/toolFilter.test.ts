import { describe, it, expect } from 'vitest';
import { filterTools, TOOL_BUNDLES, OPT_IN_TOOLS } from '../src/toolFilter.js';
import type { ToolDef } from '../src/tools/types.js';

// Every tool name known to the bundles, as a stand-in for the real tool list.
const ALL_NAMES = [...new Set(Object.values(TOOL_BUNDLES).flat())];
const ALL: ToolDef[] = ALL_NAMES.map((name) => ({ name, description: '', inputSchema: {} }));
const names = (tools: ToolDef[]) => tools.map((t) => t.name);

describe('filterTools', () => {
  it('default exposure is everything except opt-in (vision) tools', () => {
    const out = names(filterTools(ALL, undefined));
    for (const n of OPT_IN_TOOLS) expect(out).not.toContain(n);
    expect(out.length).toBe(ALL.length - OPT_IN_TOOLS.size);
  });

  it('expands bundle names and accepts individual tool names, mixed', () => {
    const out = names(filterTools(ALL, 'search, browser_navigate'));
    expect(new Set(out)).toEqual(new Set([...TOOL_BUNDLES.search, 'browser_navigate']));
  });

  it('vision bundle is available when requested explicitly', () => {
    const out = names(filterTools(ALL, 'vision'));
    expect(new Set(out)).toEqual(new Set(TOOL_BUNDLES.vision));
  });

  it('unknown tokens expose nothing rather than falling back to all', () => {
    expect(filterTools(ALL, 'no_such_bundle')).toEqual([]);
  });
});

describe('lean preset', () => {
  it('is a documented bundle of about 20 tools', () => {
    expect(TOOL_BUNDLES.lean.length).toBe(20);
    expect(new Set(TOOL_BUNDLES.lean).size).toBe(TOOL_BUNDLES.lean.length);
  });

  it('contains only tools that exist in other bundles', () => {
    const known = new Set(
      Object.entries(TOOL_BUNDLES)
        .filter(([k]) => k !== 'lean')
        .flatMap(([, v]) => v)
    );
    for (const n of TOOL_BUNDLES.lean) expect(known).toContain(n);
  });

  it('covers the read/research/automate core and excludes web-dev helpers and vision', () => {
    const lean = new Set(TOOL_BUNDLES.lean);
    for (const n of [
      'browser_navigate',
      'browser_snapshot',
      'browser_click',
      'browser_read',
      'browser_search',
      'browser_research',
      'browser_screenshot',
    ])
      expect(lean).toContain(n);
    for (const n of [
      ...TOOL_BUNDLES.edit,
      ...TOOL_BUNDLES.vision,
      'browser_inspect_css',
      'browser_a11y_audit',
      'browser_responsive',
    ])
      expect(lean).not.toContain(n);
  });
});
