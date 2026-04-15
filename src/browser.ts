import { chromium, BrowserContext, Page, ConsoleMessage, Request, Response, CDPSession } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface ConsoleEntry {
  type: string;
  text: string;
  location?: string;
  ts: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  ts: number;
}

const DEFAULT_DATA_DIR = process.env.BROWSE_MCP_HOME
  ? join(process.env.BROWSE_MCP_HOME, 'chromium-profile')
  : join(homedir(), '.browse-mcp', 'chromium-profile');

class BrowserManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private mode: 'headless' | 'headed' = 'headless';
  private dataDir: string = DEFAULT_DATA_DIR;
  private cdp: CDPSession | null = null;
  consoleLog: ConsoleEntry[] = [];
  networkLog: NetworkEntry[] = [];
  lastSnapshot: string = '';
  handoffReason: string | null = null;

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
    page.on('console', (msg: ConsoleMessage) => {
      this.consoleLog.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()?.url,
        ts: Date.now(),
      });
      if (this.consoleLog.length > 500) this.consoleLog.shift();
    });
    page.on('pageerror', (err) => {
      this.consoleLog.push({ type: 'error', text: err.message, ts: Date.now() });
    });
    page.on('request', (req: Request) => {
      this.networkLog.push({ method: req.method(), url: req.url(), ts: Date.now() });
      if (this.networkLog.length > 500) this.networkLog.shift();
    });
    page.on('response', (res: Response) => {
      const entry = this.networkLog.find((e) => e.url === res.url() && e.status === undefined);
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

  clearConsole() { this.consoleLog = []; }
  clearNetwork() { this.networkLog = []; }

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
