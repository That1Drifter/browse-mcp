import type { Page } from 'playwright';
import { mkdirSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';

const DEFAULT_DIR = process.env.BROWSE_MCP_HOME
  ? join(process.env.BROWSE_MCP_HOME, 'downloads')
  : join(homedir(), '.browse-mcp', 'downloads');

export interface DownloadResult {
  url: string;
  path: string;
  filename: string;
  sizeBytes: number;
  contentType?: string;
}

export async function downloadUrl(page: Page, url: string, saveDir?: string): Promise<DownloadResult> {
  const dir = saveDir || DEFAULT_DIR;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Set up the download listener BEFORE triggering navigation
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });

  // goto() will throw "Download is starting" for attachments — catch it
  const navResult = await page.goto(url).catch((e) => {
    if (/download is starting/i.test(e.message)) return 'download-triggered';
    throw e;
  });

  const download = await downloadPromise.catch(() => null);
  if (!download) {
    throw new Error(`URL did not trigger a download: ${url} (nav: ${navResult})`);
  }

  const suggested = download.suggestedFilename() || basename(new URL(url).pathname) || 'download.bin';
  const outPath = join(dir, suggested);
  await download.saveAs(outPath);

  const size = existsSync(outPath) ? statSync(outPath).size : 0;
  return {
    url,
    path: outPath,
    filename: suggested,
    sizeBytes: size,
  };
}
