import { resolve, sep, posix } from 'path';

// Path confinement for caller-supplied destinations. browser_download's
// `save_dir` and browser_save_state/browser_load_state's `path` are chosen by
// the MCP caller — which, for an autonomous agent on untrusted pages, can be
// steered by prompt injection. Left unchecked, an absolute path or `..` escape
// turns "write a downloaded file" into arbitrary-file-write with
// attacker-controlled bytes (CWE-22). These helpers keep those destinations
// inside the browse-mcp data roots. See SECURITY.md.

/**
 * Confine a caller-supplied path to a root directory. `requested` is resolved
 * (relative entries against `root`, absolute entries as given); the result must
 * be `root` itself or a descendant, otherwise this throws. Returns the resolved
 * absolute path. With no `requested`, returns the resolved root.
 */
export function confineToDir(root: string, requested?: string): string {
  const base = resolve(root);
  if (requested == null || requested === '') return base;
  const target = resolve(base, requested);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(
      `Refusing path outside the allowed directory: ${JSON.stringify(requested)} ` +
        `resolves outside ${base}. Pass a path under it, or relocate the root with BROWSE_MCP_HOME.`,
    );
  }
  return target;
}

/**
 * Reduce a download filename to a bare basename: strip any directory components
 * (both separators, regardless of host OS) so a server-supplied Content-
 * Disposition or URL path can never inject a path segment. Returns '' when
 * nothing usable remains (caller should fall back to a generated name).
 */
export function safeBasename(name: string): string {
  const b = posix.basename(String(name).replace(/\\/g, '/'));
  if (!b || b === '.' || b === '..') return '';
  return b;
}
