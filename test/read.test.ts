import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, formatArticle } from '../src/read.js';

describe('htmlToMarkdown', () => {
  it('converts headings and paragraphs', () => {
    const md = htmlToMarkdown('<h1>Title</h1><p>Hello <b>world</b>.</p>');
    expect(md).toContain('# Title');
    expect(md).toContain('Hello **world**.');
  });

  it('handles em/i and strong/b', () => {
    const md = htmlToMarkdown('<p><em>a</em> <i>b</i> <strong>c</strong> <b>d</b></p>');
    expect(md).toContain('*a*');
    expect(md).toContain('*b*');
    expect(md).toContain('**c**');
    expect(md).toContain('**d**');
  });

  it('converts anchors to markdown links', () => {
    const md = htmlToMarkdown('<p><a href="https://example.com">click</a></p>');
    expect(md).toContain('[click](https://example.com)');
  });

  it('uses href as text when anchor has empty body', () => {
    const md = htmlToMarkdown('<p><a href="https://example.com"></a></p>');
    expect(md).toContain('[https://example.com](https://example.com)');
  });

  it('renders img with alt/src', () => {
    const md = htmlToMarkdown('<p><img src="/a.png" alt="pic"></p>');
    expect(md).toContain('![pic](/a.png)');
  });

  it('renders unordered and ordered lists', () => {
    const ul = htmlToMarkdown('<ul><li>one</li><li>two</li></ul>');
    expect(ul).toMatch(/- one/);
    expect(ul).toMatch(/- two/);
    const ol = htmlToMarkdown('<ol><li>one</li><li>two</li></ol>');
    expect(ol).toMatch(/1\. one/);
    expect(ol).toMatch(/2\. two/);
  });

  it('renders blockquotes with > prefix', () => {
    const md = htmlToMarkdown('<blockquote><p>quoted</p></blockquote>');
    expect(md).toContain('> quoted');
  });

  it('renders inline code and fenced pre blocks', () => {
    expect(htmlToMarkdown('<p>use <code>x()</code></p>')).toContain('`x()`');
    const pre = htmlToMarkdown('<pre><code>line1\nline2</code></pre>');
    expect(pre).toMatch(/```[\s\S]*line1[\s\S]*line2[\s\S]*```/);
  });

  it('drops script/style/noscript', () => {
    const md = htmlToMarkdown('<p>ok</p><script>alert(1)</script><style>.x{}</style><noscript>no</noscript>');
    expect(md).toContain('ok');
    expect(md).not.toContain('alert');
    expect(md).not.toContain('.x{}');
    expect(md).not.toContain('no');
  });

  it('renders br and hr', () => {
    expect(htmlToMarkdown('<p>a<br>b</p>')).toMatch(/a.*\n.*b/s);
    expect(htmlToMarkdown('<p>a</p><hr><p>b</p>')).toContain('---');
  });

  it('decodes entities in text nodes', () => {
    expect(htmlToMarkdown('<p>Tom &amp; Jerry &#39;95</p>')).toContain("Tom & Jerry '95");
  });

  it('is forgiving about unclosed tags', () => {
    const md = htmlToMarkdown('<p>one<p>two');
    expect(md).toContain('one');
    expect(md).toContain('two');
  });
});

describe('formatArticle', () => {
  const article = {
    title: 'T',
    byline: 'Author',
    siteName: 'Site',
    content: '<p>Body</p>',
    textContent: 'Body',
    length: 4,
    excerpt: 'Body',
    lang: 'en',
  };

  it('returns JSON when format=json', () => {
    const out = formatArticle(article, 'json');
    expect(JSON.parse(out).title).toBe('T');
  });

  it('returns plain text when format=text', () => {
    expect(formatArticle(article, 'text')).toBe('Body');
  });

  it('returns markdown with title + byline when format=markdown', () => {
    const md = formatArticle(article, 'markdown');
    expect(md).toContain('# T');
    expect(md).toContain('By Author');
    expect(md).toContain('Site');
    expect(md).toContain('Body');
  });
});
