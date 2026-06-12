// Network policy from env vars: outbound proxy and a top-level-navigation
// origin fence. Pure parsing/matching lives here so it can be unit-tested;
// browser.ts wires it into the Playwright context.

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
  bypass?: string;
}

export interface FenceConfig {
  allowed: string[];
  blocked: string[];
}

/**
 * BROWSE_MCP_PROXY accepts http://host:port, http://user:pass@host:port, or
 * socks5://host:port. BROWSE_MCP_PROXY_BYPASS is passed through to Playwright
 * (comma-separated hosts, e.g. "localhost,*.internal").
 */
export function parseProxyEnv(env: NodeJS.ProcessEnv = process.env): ProxyConfig | undefined {
  const raw = env.BROWSE_MCP_PROXY?.trim();
  if (!raw) return undefined;
  const bypass = env.BROWSE_MCP_PROXY_BYPASS?.trim();
  try {
    // Bare host:port parses as a custom scheme via new URL(), so only treat
    // values with an explicit scheme as URLs.
    if (!raw.includes('://')) throw new Error('not url-shaped');
    const u = new URL(raw);
    const out: ProxyConfig = { server: `${u.protocol}//${u.host}` };
    if (u.username) out.username = decodeURIComponent(u.username);
    if (u.password) out.password = decodeURIComponent(u.password);
    if (bypass) out.bypass = bypass;
    return out;
  } catch {
    // Not URL-shaped (e.g. bare host:port) — hand it to Playwright as-is.
    return bypass ? { server: raw, bypass } : { server: raw };
  }
}

export function parseFenceEnv(env: NodeJS.ProcessEnv = process.env): FenceConfig {
  const parse = (v?: string) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  return {
    allowed: parse(env.BROWSE_MCP_ALLOWED_ORIGINS),
    blocked: parse(env.BROWSE_MCP_BLOCKED_ORIGINS),
  };
}

// "example.com" matches example.com and any subdomain. Entries may carry a
// scheme or path ("https://example.com/x"); only the hostname is used.
function hostMatches(host: string, entry: string): boolean {
  const e = entry.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/:].*$/, '');
  return e !== '' && (host === e || host.endsWith('.' + e));
}

export function checkUrlAllowed(
  url: string,
  cfg: FenceConfig,
): { allowed: boolean; reason?: string } {
  if (!cfg.allowed.length && !cfg.blocked.length) return { allowed: true };
  let host: string;
  try {
    const u = new URL(url);
    // Only http(s) is fenced; data:, about:, blob: carry no network origin.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { allowed: true };
    host = u.hostname.toLowerCase();
  } catch {
    return { allowed: true };
  }
  if (cfg.blocked.some((e) => hostMatches(host, e))) {
    return { allowed: false, reason: `${host} matches BROWSE_MCP_BLOCKED_ORIGINS` };
  }
  if (cfg.allowed.length && !cfg.allowed.some((e) => hostMatches(host, e))) {
    return { allowed: false, reason: `${host} is not in BROWSE_MCP_ALLOWED_ORIGINS` };
  }
  return { allowed: true };
}
