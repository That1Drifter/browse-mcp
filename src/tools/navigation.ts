import { browser } from '../browser.js';
import { resolveRef } from '../snapshot.js';
import { downloadUrl } from '../download.js';
import { findByText, waitForText } from '../finder.js';
import { text, type ToolModule } from './types.js';

export const navigation: ToolModule = {
  tools: [
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL. Waits for load event.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
          wait_until: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
            description: 'Wait condition (default: load)',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'browser_click',
      description: 'Click an element by @ref (from snapshot) or CSS selector.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '@eN ref or CSS selector' },
        },
        required: ['target'],
      },
    },
    {
      name: 'browser_type',
      description: 'Fill an input with text (replaces existing value).',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '@eN ref or CSS selector' },
          text: { type: 'string', description: 'Text to fill' },
          press_enter: { type: 'boolean', description: 'Press Enter after filling' },
        },
        required: ['target', 'text'],
      },
    },
    {
      name: 'browser_press_key',
      description: 'Press a keyboard key on the focused element (e.g. Enter, Tab, Escape).',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key name' },
        },
        required: ['key'],
      },
    },
    {
      name: 'browser_hover',
      description:
        'Hover over an element (by @ref or selector) to trigger hover states, menus, tooltips.',
      inputSchema: {
        type: 'object',
        properties: { target: { type: 'string', description: '@ref or CSS selector' } },
        required: ['target'],
      },
    },
    {
      name: 'browser_scroll',
      description:
        'Scroll the page. With no args: scroll to bottom. With selector: scroll element into view. Useful for triggering lazy-loaded content.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '@ref or CSS selector to scroll into view' },
          to: {
            type: 'string',
            enum: ['top', 'bottom'],
            description: 'Scroll to top or bottom of page',
          },
        },
      },
    },
    {
      name: 'browser_wait_for',
      description: 'Wait for a selector to appear, a timeout, or a load state.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to wait for' },
          timeout_ms: { type: 'number', description: 'Max wait in ms (default 15000)' },
          state: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            description: 'Load state to wait for',
          },
        },
      },
    },
    {
      name: 'browser_find_text',
      description:
        'Find an element by visible text (pierces shadow DOM and iframes) and optionally act on it. Use when you know what the user would click but the ref system does not surface it — e.g. dynamically mounted UI, non-ARIA buttons, late-loading panels. Action defaults to "info" (just return what was found). Action "click" / "hover" / "scroll_into_view" / "focus" act on the element.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description:
              'Text to search for (matches aria-label, title, placeholder, or textContent)',
          },
          role: {
            type: 'string',
            description: 'Optional role/tag filter: button, link, textbox, heading',
          },
          exact: { type: 'boolean', description: 'Exact match (default: substring)' },
          case_sensitive: { type: 'boolean', description: 'Case-sensitive match (default: false)' },
          action: {
            type: 'string',
            enum: ['info', 'click', 'hover', 'scroll_into_view', 'focus'],
            description: 'What to do when found (default: info)',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'browser_wait_for_text',
      description:
        'Wait up to timeout_ms for visible text to appear on the page (including inside shadow DOM and iframes). Useful after triggering an action that reveals a late-loading panel (e.g. YouTube transcript panel, toast notification).',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to wait for' },
          role: { type: 'string', description: 'Optional role filter' },
          timeout_ms: { type: 'number', description: 'Max wait (default 10000)' },
        },
        required: ['text'],
      },
    },
    {
      name: 'browser_eval',
      description:
        'Run a JavaScript expression in the page context and return the result as a string.',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'JS expression (not statement)' },
        },
        required: ['expression'],
      },
    },
    {
      name: 'browser_close',
      description: 'Close the browser and release all resources.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  handlers: {
    async browser_navigate(a) {
      const page = await browser.getPage();
      const url: string = a.url;
      if (typeof url === 'string' && /\.pdf(\?.*)?$/i.test(url)) {
        const result = await downloadUrl(page, url);
        return text(
          `Detected download — saved to ${result.path} (${result.sizeBytes} bytes). Use browser_download to fetch directly next time.`,
        );
      }
      try {
        await page.goto(url, { waitUntil: a.wait_until || 'load' });
      } catch (e: any) {
        if (/download is starting/i.test(e?.message || '')) {
          const result = await downloadUrl(page, url);
          return text(
            `Detected download — saved to ${result.path} (${result.sizeBytes} bytes). Use browser_download to fetch directly next time.`,
          );
        }
        throw e;
      }
      let msg = `Navigated to ${page.url()}`;
      try {
        const currentUrl = page.url();
        const urlHit = /\/static-pages\/418|\/cdn-cgi\/|\/distil_r_captcha|\/_recaptcha/i.test(
          currentUrl,
        );
        const bodyHit = await Promise.race([
          page.evaluate(() => {
            const t = (document.body?.innerText || '').toLowerCase();
            const title = (document.title || '').toLowerCase();
            const needles = [
              'checking your browser',
              'verify you are human',
              'captcha',
              'cloudflare',
              'challenge',
            ];
            return needles.some((n) => t.includes(n) || title.includes(n));
          }),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 300)),
        ]);
        if (urlHit || bodyHit) {
          msg += `\n\n[heads-up] Looks like a bot-detection / CAPTCHA interstitial. Consider browser_handoff to let the user solve it interactively.`;
        }
      } catch {
        /* silent */
      }
      return text(msg);
    },

    async browser_click(a) {
      const page = await browser.getPage();
      if (a.target.startsWith('@')) {
        const { locator } = await resolveRef(page, a.target);
        await locator.click();
      } else {
        await page.click(a.target);
      }
      return text(`Clicked ${a.target}`);
    },

    async browser_type(a) {
      const page = await browser.getPage();
      if (a.target.startsWith('@')) {
        const { locator } = await resolveRef(page, a.target);
        await locator.fill(a.text);
        if (a.press_enter) await locator.press('Enter');
      } else {
        await page.fill(a.target, a.text);
        if (a.press_enter) await page.press(a.target, 'Enter');
      }
      return text(`Typed into ${a.target}`);
    },

    async browser_press_key(a) {
      const page = await browser.getPage();
      await page.keyboard.press(a.key);
      return text(`Pressed ${a.key}`);
    },

    async browser_hover(a) {
      const page = await browser.getPage();
      if (a.target.startsWith('@')) {
        const { locator } = await resolveRef(page, a.target);
        await locator.hover();
      } else {
        await page.hover(a.target);
      }
      return text(`Hovered ${a.target}`);
    },

    async browser_scroll(a) {
      const page = await browser.getPage();
      if (a.target) {
        if (a.target.startsWith('@')) {
          const { locator } = await resolveRef(page, a.target);
          await locator.scrollIntoViewIfNeeded();
        } else {
          await page.locator(a.target).first().scrollIntoViewIfNeeded();
        }
        return text(`Scrolled ${a.target} into view`);
      }
      const to = a.to || 'bottom';
      await page.evaluate((t: any) => {
        if (t === 'top') window.scrollTo(0, 0);
        else window.scrollTo(0, document.body.scrollHeight);
      }, to);
      return text(`Scrolled to ${to}`);
    },

    async browser_wait_for(a) {
      const page = await browser.getPage();
      const timeout = a.timeout_ms ?? 15000;
      if (a.selector) await page.waitForSelector(a.selector, { timeout });
      else if (a.state) await page.waitForLoadState(a.state, { timeout });
      else await page.waitForTimeout(timeout);
      return text('ok');
    },

    async browser_find_text(a) {
      const page = await browser.getPage();
      const found = await findByText(page, {
        text: a.text,
        role: a.role,
        exact: !!a.exact,
        caseSensitive: !!a.case_sensitive,
      });
      if (!found)
        return text(`(not found: ${JSON.stringify(a.text)}${a.role ? ` role=${a.role}` : ''})`);
      const desc = `Found <${found.tag.toLowerCase()}>${found.role ? ` role=${found.role}` : ''} "${found.text}"`;
      const action = a.action || 'info';
      const locator = found.frame.locator(found.selector);
      try {
        if (action === 'click') {
          await locator.click();
          return text(`${desc} — clicked`);
        }
        if (action === 'hover') {
          await locator.hover();
          return text(`${desc} — hovered`);
        }
        if (action === 'focus') {
          await locator.focus();
          return text(`${desc} — focused`);
        }
        if (action === 'scroll_into_view') {
          await locator.scrollIntoViewIfNeeded();
          return text(`${desc} — scrolled into view`);
        }
        return text(desc);
      } finally {
        // Strip the temp marker so repeated finds don't collide
        await found.frame
          .evaluate(
            `(()=>{const el=document.querySelector('[data-browse-find=${JSON.stringify(found.marker)}]');if(el)el.removeAttribute('data-browse-find');})()`,
          )
          .catch(() => {});
      }
    },

    async browser_wait_for_text(a) {
      const page = await browser.getPage();
      const timeout = typeof a.timeout_ms === 'number' ? a.timeout_ms : 10000;
      const found = await waitForText(page, { text: a.text, role: a.role }, timeout);
      await found.frame
        .evaluate(
          `(m)=>{const el=document.querySelector('[data-browse-find="'+m+'"]');if(el)el.removeAttribute('data-browse-find');}`,
          found.marker,
        )
        .catch(() => {});
      return text(
        `Found <${found.tag.toLowerCase()}>${found.role ? ` role=${found.role}` : ''} "${found.text}"`,
      );
    },

    async browser_eval(a) {
      const page = await browser.getPage();
      const result = await page.evaluate(new Function(`return (${a.expression});`) as any);
      return text(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    },

    async browser_close() {
      await browser.close();
      return text('Browser closed');
    },
  },
};
