# growi-plugin-anchor-return-link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Growiのアンカーリンク先の見出しに「↩」戻るリンクを自動追加するrehypeプラグインを作成する

**Architecture:** rehypeプラグインがHASTを2パスで走査し、パス1でアンカーリンクにIDを付与・収集、パス2で対応する見出しに戻るリンクを挿入する。client-entry.tsxでgrowiFacadeにフックを登録する。

**Tech Stack:** TypeScript, Vite, React, unified/rehype, unist-util-visit, hast

**Spec:** `docs/superpowers/specs/2026-03-25-anchor-return-link-design.md`

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "growi-plugin-anchor-return-link",
  "version": "0.1.0",
  "description": "Growi plugin that adds return links to anchor-targeted headings",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/hast": "^3.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "rehype-parse": "^9.0.1",
    "rehype-stringify": "^10.0.0",
    "typescript": "^5.0.0",
    "unified": "^11.0.0",
    "unist-util-visit": "^5.1.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "growiPlugin": {
    "schemaVersion": 4,
    "types": [
      "script"
    ]
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.claude/settings.local.json
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src", "client-entry.tsx"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      input: ['client-entry.tsx'],
    },
  },
});
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore tsconfig.json tsconfig.node.json vite.config.ts
git commit -m "chore: scaffold project with Vite, TypeScript, and Growi plugin config"
```

---

### Task 2: rehype plugin — core logic with TDD

**Files:**
- Create: `src/index.ts`
- Create: `src/__tests__/index.test.ts`

- [ ] **Step 1: Create test file with basic test case**

Create `src/__tests__/index.test.ts`:

```ts
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

  it('works across h1-h6', () => {
    const input = '<p><a href="#h1">h1</a><a href="#h3">h3</a><a href="#h6">h6</a></p><h1 id="h1">H1</h1><h3 id="h3">H3</h3><h6 id="h6">H6</h6>';
    const output = process(input);
    expect(output.match(/anchor-return-link/g)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run`
Expected: FAIL — `rehypeAnchorReturnLink` does not exist yet

- [ ] **Step 3: Implement the rehype plugin**

Create `src/index.ts`:

```ts
import type { Plugin } from 'unified';
import type { Root, Element, ElementContent } from 'hast';
import { visit } from 'unist-util-visit';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export const rehypeAnchorReturnLink: Plugin<[], Root> = () => {
  return (tree: Root) => {
    // Pass 1: Collect anchor links and assign IDs
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

      if (anchorTargets.has(target)) return;

      const refId = `anchor-ref-${rawTarget}`;
      node.properties = node.properties ?? {};
      node.properties.id = refId;
      anchorTargets.set(target, refId);
    });

    if (anchorTargets.size === 0) return;

    // Pass 2: Add return links to targeted headings
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/__tests__/index.test.ts
git commit -m "feat: implement rehypeAnchorReturnLink plugin with tests"
```

---

### Task 3: client-entry.tsx — Growi facade hook registration

**Files:**
- Create: `client-entry.tsx`

- [ ] **Step 1: Create client-entry.tsx**

```tsx
import config from './package.json' with { type: 'json' };
import { rehypeAnchorReturnLink } from './src/index';

type OptionsGenerator = (...args: any[]) => any;

const activate = (): void => {
  const growiFacade = (window as any).growiFacade;

  if (growiFacade?.markdownRenderer == null) {
    return;
  }

  const { optionsGenerators } = growiFacade.markdownRenderer;

  // ページ表示用
  const originalGenerateViewOptions: OptionsGenerator | undefined =
    optionsGenerators.customGenerateViewOptions;
  optionsGenerators.customGenerateViewOptions = (...args: any[]) => {
    const options = (originalGenerateViewOptions ?? optionsGenerators.generateViewOptions)(...args);
    options.rehypePlugins = options.rehypePlugins ?? [];
    options.rehypePlugins.push(rehypeAnchorReturnLink);
    return options;
  };

  // エディタプレビュー用
  const originalGeneratePreviewOptions: OptionsGenerator | undefined =
    optionsGenerators.customGeneratePreviewOptions;
  optionsGenerators.customGeneratePreviewOptions = (...args: any[]) => {
    const options = (originalGeneratePreviewOptions ?? optionsGenerators.generatePreviewOptions)(...args);
    options.rehypePlugins = options.rehypePlugins ?? [];
    options.rehypePlugins.push(rehypeAnchorReturnLink);
    return options;
  };

  (activate as any)._origView = originalGenerateViewOptions;
  (activate as any)._origPreview = originalGeneratePreviewOptions;
};

const deactivate = (): void => {
  const growiFacade = (window as any).growiFacade;
  if (growiFacade?.markdownRenderer == null) {
    return;
  }

  const { optionsGenerators } = growiFacade.markdownRenderer;
  const origView = (activate as any)._origView;
  const origPreview = (activate as any)._origPreview;

  if (origView !== undefined) {
    optionsGenerators.customGenerateViewOptions = origView;
  }
  if (origPreview !== undefined) {
    optionsGenerators.customGeneratePreviewOptions = origPreview;
  }
};

if ((window as any).pluginActivators == null) {
  (window as any).pluginActivators = {};
}
(window as any).pluginActivators[config.name] = { activate, deactivate };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client-entry.tsx
git commit -m "feat: add client-entry with growiFacade hook registration"
```

---

### Task 4: Build verification

**Files:** (none new)

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: `dist/` directory created with `manifest.json` and bundled JS

- [ ] **Step 2: Verify dist/manifest.json contains the entry**

Run: `cat dist/.vite/manifest.json`
Expected: JSON with `client-entry.tsx` as a key and file path to the built JS

- [ ] **Step 3: Run all tests one final time**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 4: Commit dist/ for Growi plugin loading**

Growi Script Plugins (schemaVersion 4) require `dist/` in the repository. Remove `dist/` from `.gitignore` and commit build output.

```bash
sed -i '/^dist\/$/d' .gitignore
git add .gitignore dist/
git commit -m "chore: add build output for Growi plugin loading"
```
