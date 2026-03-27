import type { Plugin } from 'unified';
import type { Root, Element } from 'hast';
import type { Root as MdastRoot, Link } from 'mdast';
import { visit } from 'unist-util-visit';
import { slug } from 'github-slugger';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Remark plugin: marks user-written anchor links (#xxx) with a data attribute.
 * Must run before other remark plugins (e.g. remark-toc) that auto-generate anchor links.
 * The data-user-anchor attribute survives the mdast→hast conversion via hProperties.
 */
export const remarkTagUserAnchors: Plugin<[], MdastRoot> = () => {
  return (tree: MdastRoot) => {
    visit(tree, 'link', (node: Link) => {
      if (node.url.startsWith('#') && node.url !== '#') {
        node.data = node.data ?? {};
        const hProps = (node.data.hProperties ?? {}) as Record<string, string>;
        hProps.dataUserAnchor = 'true';
        node.data.hProperties = hProps;
      }
    });
  };
};

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

    // Pass 2: Collect user-written anchor links targeting headings and assign IDs
    const anchorTargets = new Map<string, string>(); // decoded target -> anchor ref id

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return;

      // Only process user-written anchors (tagged by remarkTagUserAnchors)
      if (node.properties?.dataUserAnchor !== 'true') return;

      const href = String(node.properties?.href ?? '');
      if (!href.startsWith('#') || href === '#') return;

      const rawTarget = href.slice(1);
      let decoded: string;
      try {
        decoded = decodeURIComponent(rawTarget);
      } catch {
        decoded = rawTarget;
      }

      // Match against heading IDs: try exact match first, then slugified
      let matchedId: string | undefined;
      if (headingIds.has(decoded)) {
        matchedId = decoded;
      } else {
        const slugified = slug(decoded);
        if (headingIds.has(slugified)) {
          matchedId = slugified;
        }
      }
      if (!matchedId) return;
      if (anchorTargets.has(matchedId)) return;

      const refId = `anchor-ref-${rawTarget}`;
      node.properties.id = refId;
      anchorTargets.set(matchedId, refId);
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
