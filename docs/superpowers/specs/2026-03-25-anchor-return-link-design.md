# growi-plugin-anchor-return-link Design Spec

## Overview

Growi用プラグイン。Markdownのアンカーリンク (`[ラベル](#header)`) に対応する見出し要素に「↩」の戻るリンクを自動追加する。クリックするとアンカーリンクの位置に戻れる。

## 動作フロー

1. rehypeプラグインがHAST（HTML AST）を走査する
2. `<a href="#xxx">` 形式のページ内アンカーリンクを検出し、一意のID (`anchor-ref-xxx`) を付与する
3. 対応する見出し要素 (`<h1>`〜`<h6>` で `id="xxx"` を持つもの) を探す
4. 見出しの子要素末尾に `<a href="#anchor-ref-xxx" class="anchor-return-link">↩</a>` を追加する
5. 同じ見出しへの複数アンカーリンクがある場合は、最初に検出されたもののみを対象とする

## 技術構成

### プラグイン形式

- Growi Script Plugin（`growiPlugin.schemaVersion: 4`, `types: ["script"]`）
- rehypeプラグインとして実装
- View（閲覧ページ）とPreview（エディタプレビュー）の両方にフック

### ディレクトリ構成

```
growi-plugin-anchor-return-link/
├── client-entry.tsx          # エントリーポイント（growiFacadeへのフック登録）
├── package.json              # プラグインメタデータ・growiPlugin設定
├── tsconfig.json             # TypeScript設定
├── vite.config.ts            # Viteビルド設定
├── src/
│   └── index.ts              # rehypeプラグイン本体
└── .gitignore
```

### client-entry.tsx

- `growiFacade.markdownRenderer.optionsGenerators` の `customGenerateViewOptions` と `customGeneratePreviewOptions` をオーバーライド
- 既存のカスタムオプションがあればチェーンする（他プラグインとの互換性確保）
- `options.rehypePlugins` に自作rehypeプラグインを追加

### src/index.ts（rehypeプラグイン）

- `unist-util-visit` を使ってHASTを走査
- **パス1**: アンカーリンク (`a[href^="#"]`) を収集し、各リンクに `id="anchor-ref-{target}"` を付与。同じターゲットへの最初のリンクのみ記録
- **パス2**: 見出し要素 (`h1`〜`h6`) を走査し、パス1で記録されたターゲットと `id` が一致する見出しに戻るリンク要素を追加

### 戻るリンク要素の構造

```html
<a href="#anchor-ref-xxx" class="anchor-return-link">↩</a>
```

- CSSクラス `anchor-return-link` を付与し、スタイリングはGrowiのテーマに委ねる
- Light/Darkモード両対応のため、インラインスタイルは使用しない

## スコープ外

- 見出し以外の要素（例: `<div id="xxx">`）への戻るリンク付与
- 複数アンカーからの戻りリンク（最初の参照元のみ対象）
- カスタムスタイルの同梱（CSSクラスのみ提供）

## 依存関係

### dependencies

- `react` / `react-dom` — Growiの要件

### devDependencies

- `@types/hast` — HAST型定義
- `typescript` — 型チェック
- `unified` — unified ecosystemの型
- `unist-util-visit` — AST走査ユーティリティ
- `vite` — ビルドツール
- `@vitejs/plugin-react` — Vite Reactプラグイン
