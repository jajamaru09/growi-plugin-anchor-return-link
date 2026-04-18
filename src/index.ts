import type { Plugin } from 'unified';
import type { Root, Element } from 'hast';
import type { Root as MdastRoot, Link } from 'mdast';
import { visit } from 'unist-util-visit';
import { slug } from 'github-slugger';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

export interface PluginOptions {
  log?: LogFn;
  context?: string;
}

/**
 * Remark plugin: marks user-written anchor links (#xxx) with a data attribute.
 * Must run before other remark plugins (e.g. remark-toc) that auto-generate anchor links.
 * The data-user-anchor attribute survives the mdast→hast conversion via hProperties.
 */
export const remarkTagUserAnchors: Plugin<[PluginOptions?], MdastRoot> = (options) => {
  const log = options?.log ?? noop;
  const ctx = options?.context ?? 'view';
  return (tree: MdastRoot) => {
    let totalLinks = 0;
    let taggedLinks = 0;
    const sampleTargets: string[] = [];
    visit(tree, 'link', (node: Link) => {
      totalLinks += 1;
      if (node.url.startsWith('#') && node.url !== '#') {
        node.data = node.data ?? {};
        const hProps = (node.data.hProperties ?? {}) as Record<string, string>;
        hProps.dataUserAnchor = 'true';
        node.data.hProperties = hProps;
        taggedLinks += 1;
        if (sampleTargets.length < 5) sampleTargets.push(node.url);
      }
    });
    log(
      `[remarkTagUserAnchors/${ctx}] scanned ${totalLinks} link(s), tagged ${taggedLinks} user anchor(s)`,
      taggedLinks > 0 ? { sample: sampleTargets } : '',
    );
  };
};

export const rehypeAnchorReturnLink: Plugin<[PluginOptions?], Root> = (options) => {
  const log = options?.log ?? noop;
  const ctx = options?.context ?? 'view';
  return (tree: Root) => {
    // Pass 1: Collect heading IDs
    const headingIds = new Set<string>();
    visit(tree, 'element', (node: Element) => {
      if (!HEADING_TAGS.has(node.tagName)) return;
      const id = String(node.properties?.id ?? '');
      if (id) headingIds.add(id);
    });

    log(
      `[rehypeAnchorReturnLink/${ctx}] pass1: collected ${headingIds.size} heading id(s)`,
      headingIds.size > 0 ? Array.from(headingIds).slice(0, 5) : '',
    );

    if (headingIds.size === 0) {
      log(`[rehypeAnchorReturnLink/${ctx}] no headings with id — skip`);
      return;
    }

    // Pass 2: Collect user-written anchor links targeting headings and assign IDs
    const anchorTargets = new Map<string, string>(); // decoded target -> anchor ref id
    let userAnchorCount = 0;
    let unmatchedAnchorCount = 0;
    let duplicateTargetCount = 0;
    let rewrittenHrefCount = 0;
    const MAX_PER_ITEM_LOG = 5;
    let unmatchedLogged = 0;
    let duplicateLogged = 0;

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return;

      // Only process user-written anchors (tagged by remarkTagUserAnchors)
      if (node.properties?.dataUserAnchor !== 'true') return;

      userAnchorCount += 1;
      const href = String(node.properties?.href ?? '');
      if (!href.startsWith('#') || href === '#') return;

      const rawTarget = href.slice(1);
      let decoded: string;
      try {
        decoded = decodeURIComponent(rawTarget);
      }
      catch {
        decoded = rawTarget;
      }

      // Match against heading IDs: try exact match first, then slugified
      let matchedId: string | undefined;
      if (headingIds.has(decoded)) {
        matchedId = decoded;
      }
      else {
        const slugified = slug(decoded);
        if (headingIds.has(slugified)) {
          matchedId = slugified;
        }
      }
      if (!matchedId) {
        unmatchedAnchorCount += 1;
        if (unmatchedLogged < MAX_PER_ITEM_LOG) {
          log(`[rehypeAnchorReturnLink/${ctx}] unmatched anchor href="${href}" decoded="${decoded}"`);
          unmatchedLogged += 1;
        }
        return;
      }
      if (anchorTargets.has(matchedId)) {
        duplicateTargetCount += 1;
        if (duplicateLogged < MAX_PER_ITEM_LOG) {
          log(`[rehypeAnchorReturnLink/${ctx}] duplicate anchor target "${matchedId}" — using first only`);
          duplicateLogged += 1;
        }
        return;
      }

      // Rewrite href to the actual heading ID so browser navigation works
      if (decoded !== matchedId) {
        node.properties.href = `#${matchedId}`;
        rewrittenHrefCount += 1;
      }

      const refId = `anchor-ref-${matchedId}`;
      node.properties.id = refId;
      anchorTargets.set(matchedId, refId);
    });

    if (unmatchedAnchorCount > MAX_PER_ITEM_LOG) {
      log(`[rehypeAnchorReturnLink/${ctx}] ... and ${unmatchedAnchorCount - MAX_PER_ITEM_LOG} more unmatched (suppressed)`);
    }
    if (duplicateTargetCount > MAX_PER_ITEM_LOG) {
      log(`[rehypeAnchorReturnLink/${ctx}] ... and ${duplicateTargetCount - MAX_PER_ITEM_LOG} more duplicates (suppressed)`);
    }
    log(
      `[rehypeAnchorReturnLink/${ctx}] pass2: ${userAnchorCount} user anchor(s), `
      + `matched=${anchorTargets.size}, unmatched=${unmatchedAnchorCount}, `
      + `duplicates=${duplicateTargetCount}, hrefRewritten=${rewrittenHrefCount}`,
    );

    if (anchorTargets.size === 0) {
      log(`[rehypeAnchorReturnLink/${ctx}] no matched anchors — skip pass3`);
      return;
    }

    // Pass 3: Add return links to targeted headings
    let returnLinksAdded = 0;
    let skippedIdempotent = 0;

    visit(tree, 'element', (node: Element) => {
      if (!HEADING_TAGS.has(node.tagName)) return;

      const headingId = String(node.properties?.id ?? '');
      if (!headingId || !anchorTargets.has(headingId)) return;

      // Idempotency check
      const alreadyHasReturnLink = node.children.some(
        child =>
          child.type === 'element'
          && child.tagName === 'a'
          && Array.isArray(child.properties?.className)
          && (child.properties.className as string[]).includes('anchor-return-link'),
      );
      if (alreadyHasReturnLink) {
        skippedIdempotent += 1;
        return;
      }

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
      returnLinksAdded += 1;
    });

    log(
      `[rehypeAnchorReturnLink/${ctx}] pass3: added ${returnLinksAdded} return link(s), `
      + `skipped ${skippedIdempotent} idempotent`,
    );
  };
};
