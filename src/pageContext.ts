import type { Page } from 'playwright';

// Shared "what is the page actually showing" helpers. Used to enrich timeout
// and not-found errors so the agent can tell a genuinely missing element from
// a bot-detection interstitial it should hand off to the user.

export interface PageContextInfo {
  url: string;
  title: string;
  readyState: string;
  excerpt: string;
}

const CHALLENGE_URL_RE = /\/static-pages\/418|\/cdn-cgi\/|\/distil_r_captcha|\/_recaptcha/i;
const CHALLENGE_NEEDLES = [
  'checking your browser',
  'verify you are human',
  'just a moment',
  'captcha',
  'cloudflare',
  'challenge',
];

export const HANDOFF_HINT =
  '[heads-up] Looks like a bot-detection / CAPTCHA interstitial. Consider browser_handoff to let the user solve it interactively.';

export function looksLikeChallenge(url: string, title: string, bodyText: string): boolean {
  if (CHALLENGE_URL_RE.test(url)) return true;
  const t = bodyText.toLowerCase();
  const ti = title.toLowerCase();
  return CHALLENGE_NEEDLES.some((n) => t.includes(n) || ti.includes(n));
}

export function formatPageContext(info: PageContextInfo): string {
  const lines = [`Page at failure: ${info.url} (readyState=${info.readyState})`];
  if (info.title) lines.push(`Title: ${info.title}`);
  if (info.excerpt) lines.push(`Body starts: ${info.excerpt}`);
  if (looksLikeChallenge(info.url, info.title, info.excerpt)) lines.push(HANDOFF_HINT);
  return lines.join('\n');
}

export async function getPageContext(page: Page, timeoutMs = 500): Promise<PageContextInfo | null> {
  try {
    const url = page.url();
    // The page may be wedged (that's often why we're here), so cap the evaluate.
    const info = await Promise.race([
      page.evaluate(() => ({
        title: document.title || '',
        readyState: String(document.readyState),
        excerpt: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      })),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!info) return { url, title: '', readyState: 'unknown', excerpt: '' };
    return { url, ...info };
  } catch {
    return null;
  }
}

/** Block of context to append to a timeout / not-found message; '' if unavailable. */
export async function describeFailureContext(page: Page): Promise<string> {
  const info = await getPageContext(page);
  return info ? `\n\n${formatPageContext(info)}` : '';
}
