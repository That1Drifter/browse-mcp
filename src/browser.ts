import { chromium, BrowserContext, Page, ConsoleMessage, Request, Response, CDPSession } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface ConsoleEntry {
  type: string;
  text: string;
  location?: string;
  ts: number;
  tabIndex?: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  ts: number;
  tabIndex?: number;
}

export const DEFAULT_DATA_DIR = process.env.BROWSE_MCP_HOME
  ? join(process.env.BROWSE_MCP_HOME, 'chromium-profile')
  : join(homedir(), '.browse-mcp', 'chromium-profile');

class BrowserManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private mode: 'headless' | 'headed' = 'headless';
  private dataDir: string = DEFAULT_DATA_DIR;
  private cdp: CDPSession | null = null;
  private loggerAttached: WeakSet<Page> = new WeakSet();
  private consoleLogs: WeakMap<Page, ConsoleEntry[]> = new WeakMap();
  private networkLogs: WeakMap<Page, NetworkEntry[]> = new WeakMap();
  lastSnapshot: string = '';
  handoffReason: string | null = null;

  get consoleLog(): ConsoleEntry[] {
    if (!this.page) return [];
    return this.consoleLogs.get(this.page) ?? [];
  }

  get networkLog(): NetworkEntry[] {
    if (!this.page) return [];
    return this.networkLogs.get(this.page) ?? [];
  }

  getAllConsoleLogs(): ConsoleEntry[] {
    const out: ConsoleEntry[] = [];
    for (const p of this.getAllPages()) {
      const arr = this.consoleLogs.get(p);
      if (arr) out.push(...arr);
    }
    return out;
  }

  getAllNetworkLogs(): NetworkEntry[] {
    const out: NetworkEntry[] = [];
    for (const p of this.getAllPages()) {
      const arr = this.networkLogs.get(p);
      if (arr) out.push(...arr);
    }
    return out;
  }

  getDataDir(): string { return this.dataDir; }

  private tabIndexOf(page: Page): number {
    if (!this.context) return -1;
    return this.context.pages().indexOf(page);
  }

  async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!this.context) {
      if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
      this.context = await chromium.launchPersistentContext(this.dataDir, {
        headless: this.mode === 'headless',
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/Chicago',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
      });
      // Soft stealth: remove the `navigator.webdriver` tell that WAFs check for
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
    }
    // Reuse existing page if present, else create one
    const existing = this.context.pages();
    this.page = existing.length ? existing[0] : await this.context.newPage();
    this.attachLoggers(this.page);
    return this.page;
  }

  async getCdp(): Promise<CDPSession> {
    const page = await this.getPage();
    if (this.cdp) return this.cdp;
    this.cdp = await page.context().newCDPSession(page);
    return this.cdp;
  }

  async switchMode(mode: 'headless' | 'headed', url?: string, reason?: string): Promise<void> {
    const currentUrl = url ?? (this.page && !this.page.isClosed() ? this.page.url() : 'about:blank');
    await this.closeInternal();
    this.mode = mode;
    if (mode === 'headed') this.handoffReason = reason ?? null;
    else this.handoffReason = null;
    const page = await this.getPage();
    if (currentUrl && currentUrl !== 'about:blank') {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  private attachLoggers(page: Page) {
    if (this.loggerAttached.has(page)) return;
    this.loggerAttached.add(page);
    if (!this.consoleLogs.has(page)) this.consoleLogs.set(page, []);
    if (!this.networkLogs.has(page)) this.networkLogs.set(page, []);
    const cLog = this.consoleLogs.get(page)!;
    const nLog = this.networkLogs.get(page)!;
    page.on('console', (msg: ConsoleMessage) => {
      cLog.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()?.url,
        ts: Date.now(),
        tabIndex: this.tabIndexOf(page),
      });
      if (cLog.length > 500) cLog.shift();
    });
    page.on('pageerror', (err) => {
      cLog.push({ type: 'error', text: err.message, ts: Date.now(), tabIndex: this.tabIndexOf(page) });
    });
    page.on('request', (req: Request) => {
      nLog.push({ method: req.method(), url: req.url(), ts: Date.now(), tabIndex: this.tabIndexOf(page) });
      if (nLog.length > 500) nLog.shift();
    });
    page.on('response', (res: Response) => {
      const entry = nLog.find((e) => e.url === res.url() && e.status === undefined);
      if (entry) { entry.status = res.status(); entry.ok = res.ok(); }
    });
  }

  getAllPages(): Page[] {
    return this.context ? this.context.pages() : [];
  }

  setActivePage(page: Page): void {
    this.page = page;
    this.attachLoggers(page);
  }

  clearConsole() {
    if (this.page) this.consoleLogs.set(this.page, []);
  }
  clearNetwork() {
    if (this.page) this.networkLogs.set(this.page, []);
  }

  private async closeInternal() {
    this.cdp = null;
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
      this.page = null;
    }
  }

  async close() {
    await this.closeInternal();
  }

  getMode(): 'headless' | 'headed' { return this.mode; }
  isHandoff(): boolean { return this.mode === 'headed' && this.handoffReason !== null; }
  getHandoffReason(): string | null { return this.handoffReason; }
}

export const browser = new BrowserManager();
