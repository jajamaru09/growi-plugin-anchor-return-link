import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { rehypeAnchorReturnLink } from '../index';

function process(html: string): string {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeAnchorReturnLink)
    .use(rehypeStringify)
    .processSync(html)
    .toString();
}

describe('rehypeAnchorReturnLink', () => {
  it('adds a return link to a heading targeted by an anchor', () => {
    const input = '<p><a href="#section">go to section</a></p><h2 id="section">Section</h2>';
    const output = process(input);
    expect(output).toContain('id="anchor-ref-section"');
    expect(output).toContain('<a href="#anchor-ref-section" class="anchor-return-link">↩</a>');
  });

  it('does nothing when there are no anchor links', () => {
    const input = '<h2 id="section">Section</h2>';
    const output = process(input);
    expect(output).not.toContain('anchor-return-link');
  });

  it('ignores bare hash links (href="#")', () => {
    const input = '<p><a href="#">top</a></p><h2 id="section">Section</h2>';
    const output = process(input);
    expect(output).not.toContain('anchor-return-link');
  });

  it('only uses the first anchor for duplicate targets', () => {
    const input = '<p><a href="#section">first</a></p><p><a href="#section">second</a></p><h2 id="section">Section</h2>';
    const output = process(input);
    const matches = output.match(/anchor-return-link/g);
    expect(matches).toHaveLength(1);
  });

  it('handles URL-encoded href values', () => {
    const input = '<p><a href="#my%20section">go</a></p><h2 id="my section">My Section</h2>';
    const output = process(input);
    expect(output).toContain('anchor-return-link');
  });

  it('does not add return link when heading does not exist', () => {
    const input = '<p><a href="#nonexistent">go</a></p><h2 id="section">Section</h2>';
    const output = process(input);
    expect(output).not.toContain('anchor-return-link');
  });

  it('is idempotent — does not duplicate return links', () => {
    const input = '<p><a href="#section">go</a></p><h2 id="section">Section<a href="#anchor-ref-section" class="anchor-return-link">↩</a></h2>';
    const output = process(input);
    const matches = output.match(/anchor-return-link/g);
    expect(matches).toHaveLength(1);
  });

  it('works with headings containing nested elements', () => {
    const input = '<p><a href="#section">go</a></p><h2 id="section"><code>code</code> Section</h2>';
    const output = process(input);
    expect(output).toContain('anchor-return-link');
    expect(output).toContain('<code>code</code>');
  });

  it('does not interfere with footnote references and back-links', () => {
    const input = [
      '<p>Text with a footnote<sup><a href="#fn-1" id="fnref-1">1</a></sup></p>',
      '<section class="footnotes"><ol><li id="fn-1"><p>Footnote text <a href="#fnref-1">↩</a></p></li></ol></section>',
    ].join('');
    const output = process(input);
    // Footnote reference ID must remain unchanged
    expect(output).toContain('id="fnref-1"');
    // Footnote back-link must remain unchanged
    expect(output).toContain('href="#fnref-1"');
    // Footnote definition ID must remain unchanged
    expect(output).toContain('id="fn-1"');
    // No return links should be added (footnotes are not headings)
    expect(output).not.toContain('anchor-return-link');
  });

  it('processes anchor links to headings while leaving footnotes untouched', () => {
    const input = [
      '<p><a href="#section">go to section</a></p>',
      '<p>Text with footnote<sup><a href="#fn-1" id="fnref-1">1</a></sup></p>',
      '<h2 id="section">Section</h2>',
      '<section class="footnotes"><ol><li id="fn-1"><p>Note <a href="#fnref-1">↩</a></p></li></ol></section>',
    ].join('');
    const output = process(input);
    // Anchor return link should be added for the heading
    expect(output).toContain('anchor-return-link');
    expect(output).toContain('id="anchor-ref-section"');
    // Footnote IDs must remain unchanged
    expect(output).toContain('id="fnref-1"');
    expect(output).toContain('id="fn-1"');
    expect(output).toContain('href="#fnref-1"');
  });

  it('works across h1-h6', () => {
    const input = '<p><a href="#h1">h1</a><a href="#h3">h3</a><a href="#h6">h6</a></p><h1 id="h1">H1</h1><h3 id="h3">H3</h3><h6 id="h6">H6</h6>';
    const output = process(input);
    expect(output.match(/anchor-return-link/g)).toHaveLength(3);
  });
});
