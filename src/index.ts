import type { Plugin } from 'unified';
import type { Root, Element } from 'hast';
import { visit } from 'unist-util-visit';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export const rehypeAnchorReturnLink: Plugin<[], Root> = () => {
  return (tree: Root) => {
    // Pass 1: Collect heading IDs
    const headingIds = new Set<string>();
    visit(tree, 'element', (node: Element) => {
      if (!HEADING_TAGS.has(node.tagName)) return;
      const id = String(node.properties?.id ?? '');
      if (id) headingIds.add(id);
    });

    if (headingIds.size === 0) return;

    // Pass 2: Collect anchor links targeting headings and assign IDs
    const anchorTargets = new Map<string, string>(); // decoded target -> anchor ref id

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return;

      const href = String(node.properties?.href ?? '');
      if (!href.startsWith('#') || href === '#') return;

      const rawTarget = href.slice(1);
      let target: string;
      try {
        target = decodeURIComponent(rawTarget);
      } catch {
        target = rawTarget;
      }

      // Only process anchors that target headings (skip footnotes, etc.)
      if (!headingIds.has(target)) return;
      if (anchorTargets.has(target)) return;

      const refId = `anchor-ref-${rawTarget}`;
      node.properties = node.properties ?? {};
      node.properties.id = refId;
      anchorTargets.set(target, refId);
    });

    if (anchorTargets.size === 0) return;

    // Pass 3: Add return links to targeted headings
    visit(tree, 'element', (node: Element) => {
      if (!HEADING_TAGS.has(node.tagName)) return;

      const headingId = String(node.properties?.id ?? '');
      if (!headingId || !anchorTargets.has(headingId)) return;

      // Idempotency check
      const alreadyHasReturnLink = node.children.some(
        (child) =>
          child.type === 'element' &&
          child.tagName === 'a' &&
          Array.isArray(child.properties?.className) &&
          (child.properties.className as string[]).includes('anchor-return-link'),
      );
      if (alreadyHasReturnLink) return;

      const refId = anchorTargets.get(headingId)!;
      const returnLink: Element = {
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${refId}`,
          className: ['anchor-return-link'],
        },
        children: [{ type: 'text', value: '↩' }],
      };

      node.children.push(returnLink);
    });
  };
};
