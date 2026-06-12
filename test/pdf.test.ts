import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isPdfUrl, isPdfData, extractPdfText } from '../src/pdf.js';

const fixture = () => new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'hello.pdf')));

describe('isPdfUrl', () => {
  it('matches .pdf with query strings, fragments, and mixed case', () => {
    expect(isPdfUrl('https://example.com/paper.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/paper.pdf?dl=1')).toBe(true);
    expect(isPdfUrl('https://example.com/paper.pdf#page=3')).toBe(true);
    expect(isPdfUrl('C:/Users/x/Downloads/REPORT.PDF')).toBe(true);
  });

  it('rejects non-pdf URLs', () => {
    expect(isPdfUrl('https://example.com/pdf-tools')).toBe(false);
    expect(isPdfUrl('https://example.com/a.pdfx')).toBe(false);
  });
});

describe('isPdfData', () => {
  it('accepts real PDF bytes and rejects HTML', () => {
    expect(isPdfData(fixture())).toBe(true);
    expect(isPdfData(new TextEncoder().encode('<html>Just a moment...</html>'))).toBe(false);
  });
});

describe('extractPdfText', () => {
  it('extracts text with page markers', async () => {
    const r = await extractPdfText(fixture());
    expect(r.numPages).toBe(1);
    expect(r.pagesRead).toBe(1);
    expect(r.truncated).toBe(false);
    expect(r.text).toContain('--- Page 1 of 1 ---');
    expect(r.text).toContain('Hello PDF');
    expect(r.text).toContain('quick brown fox');
  });

  it('truncates at max_chars', async () => {
    const r = await extractPdfText(fixture(), { maxChars: 30 });
    expect(r.truncated).toBe(true);
    expect(r.text).toContain('[...truncated]');
  });

  it('throws a clear error on non-PDF data', async () => {
    await expect(
      extractPdfText(new TextEncoder().encode('<html>challenge page</html>')),
    ).rejects.toThrow(/not a PDF/);
  });
});
