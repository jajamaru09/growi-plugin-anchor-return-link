import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { remarkTagUserAnchors, rehypeAnchorReturnLink } from '../index';

/** Process raw HTML through the rehype plugin only (simulates pre-tagged HTML) */
function processHtml(html: string): string {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeAnchorReturnLink)
    .use(rehypeStringify)
    .processSync(html)
    .toString();
}

/** Process markdown through the full remark→rehype pipeline (both plugins) */
function processMarkdown(md: string): string {
  return unified()
    .use(remarkParse)
    .use(remarkTagUserAnchors)
    .use(remarkRehype)
    .use(rehypeAnchorReturnLink)
    .use(rehypeStringify)
    .processSync(md)
    .toString();
}

// Helper: data-user-anchor attribute as it appears in HTML
const ua = 'data-user-anchor="true"';

describe('rehypeAnchorReturnLink', () => {
  it('adds a return link to a heading targeted by a user-written anchor', () => {
    const input = `<p><a href="#section" ${ua}>go to section</a></p><h2 id="section">Section</h2>`;
    const output = processHtml(input);
    expect(output).toContain('id="anchor-ref-section"');
    expect(output).toContain('<a href="#anchor-ref-section" class="anchor-return-link">↩</a>');
  });

  it('does nothing when there are no anchor links', () => {
    const input = '<h2 id="section">Section</h2>';
    const output = processHtml(input);
    expect(output).not.toContain('anchor-return-link');
  });

  it('ignores bare hash links (href="#")', () => {
    const input = `<p><a href="#" ${ua}>top</a></p><h2 id="section">Section</h2>`;
    const output = processHtml(input);
    expect(output).not.toContain('anchor-return-link');
  });

  it('only uses the first anchor for duplicate targets', () => {
    const input = `<p><a href="#section" ${ua}>first</a></p><p><a href="#section" ${ua}>second</a></p><h2 id="section">Section</h2>`;
    const output = processHtml(input);
    const matches = output.match(/anchor-return-link/g);
    expect(matches).toHaveLength(1);
  });

  it('handles URL-encoded href values', () => {
    const input = `<p><a href="#my%20section" ${ua}>go</a></p><h2 id="my section">My Section</h2>`;
    const output = processHtml(input);
    expect(output).toContain('anchor-return-link');
  });

  it('does not add return link when heading does not exist', () => {
    const input = `<p><a href="#nonexistent" ${ua}>go</a></p><h2 id="section">Section</h2>`;
    const output = processHtml(input);
    expect(output).not.toContain('anchor-return-link');
  });

  it('is idempotent — does not duplicate return links', () => {
    const input = `<p><a href="#section" ${ua}>go</a></p><h2 id="section">Section<a href="#anchor-ref-section" class="anchor-return-link">↩</a></h2>`;
    const output = processHtml(input);
    const matches = output.match(/anchor-return-link/g);
    expect(matches).toHaveLength(1);
  });

  it('works with headings containing nested elements', () => {
    const input = `<p><a href="#section" ${ua}>go</a></p><h2 id="section"><code>code</code> Section</h2>`;
    const output = processHtml(input);
    expect(output).toContain('anchor-return-link');
    expect(output).toContain('<code>code</code>');
  });

  it('does not interfere with footnote references and back-links', () => {
    const input = [
      '<p>Text with a footnote<sup><a href="#fn-1" id="fnref-1">1</a></sup></p>',
      '<section class="footnotes"><ol><li id="fn-1"><p>Footnote text <a href="#fnref-1">↩</a></p></li></ol></section>',
    ].join('');
    const output = processHtml(input);
    expect(output).toContain('id="fnref-1"');
    expect(output).toContain('href="#fnref-1"');
    expect(output).toContain('id="fn-1"');
    expect(output).not.toContain('anchor-return-link');
  });

  it('processes user anchors while leaving footnotes untouched', () => {
    const input = [
      `<p><a href="#section" ${ua}>go to section</a></p>`,
      '<p>Text with footnote<sup><a href="#fn-1" id="fnref-1">1</a></sup></p>',
      '<h2 id="section">Section</h2>',
      '<section class="footnotes"><ol><li id="fn-1"><p>Note <a href="#fnref-1">↩</a></p></li></ol></section>',
    ].join('');
    const output = processHtml(input);
    expect(output).toContain('anchor-return-link');
    expect(output).toContain('id="anchor-ref-section"');
    expect(output).toContain('id="fnref-1"');
    expect(output).toContain('id="fn-1"');
    expect(output).toContain('href="#fnref-1"');
  });

  it('works across h1-h6', () => {
    const input = `<p><a href="#h1" ${ua}>h1</a><a href="#h3" ${ua}>h3</a><a href="#h6" ${ua}>h6</a></p><h1 id="h1">H1</h1><h3 id="h3">H3</h3><h6 id="h6">H6</h6>`;
    const output = processHtml(input);
    expect(output.match(/anchor-return-link/g)).toHaveLength(3);
  });

  it('ignores auto-generated ToC links (without data-user-anchor)', () => {
    const input = [
      '<ul><li><a href="#section1">Section 1</a></li><li><a href="#section2">Section 2</a></li></ul>',
      '<h2 id="section1">Section 1</h2>',
      '<h2 id="section2">Section 2</h2>',
    ].join('');
    const output = processHtml(input);
    expect(output).not.toContain('anchor-return-link');
    expect(output).not.toContain('anchor-ref-');
  });

  it('processes user anchors but ignores ToC links in the same document', () => {
    const input = [
      // ToC (auto-generated, no data-user-anchor)
      '<ul><li><a href="#section1">Section 1</a></li><li><a href="#section2">Section 2</a></li></ul>',
      // User-written anchor (with data-user-anchor)
      `<p><a href="#section1" ${ua}>go to section 1</a></p>`,
      '<h2 id="section1">Section 1</h2>',
      '<h2 id="section2">Section 2</h2>',
    ].join('');
    const output = processHtml(input);
    // Only section1 (user-written anchor target) gets a return link
    expect(output).toContain('id="anchor-ref-section1"');
    expect(output).toContain('<a href="#anchor-ref-section1" class="anchor-return-link">↩</a>');
    // section2 (only referenced by ToC) must NOT get a return link
    expect(output).not.toContain('anchor-ref-section2');
  });
});

describe('remarkTagUserAnchors', () => {
  it('tags user-written anchor links with data-user-anchor in markdown', () => {
    const md = '[go to section](#section)';
    const output = processMarkdown(md);
    expect(output).toContain('data-user-anchor="true"');
    expect(output).toContain('href="#section"');
  });

  it('does not tag external links', () => {
    const md = '[example](https://example.com)';
    const output = processMarkdown(md);
    expect(output).not.toContain('data-user-anchor');
  });

  it('does not tag bare hash links', () => {
    const md = '[top](#)';
    const output = processMarkdown(md);
    expect(output).not.toContain('data-user-anchor');
  });

  it('end-to-end: tags survive remark→rehype conversion', () => {
    const md = '[go to section](#section)';
    const output = processMarkdown(md);
    expect(output).toContain('data-user-anchor="true"');
    expect(output).toContain('href="#section"');
  });
});
