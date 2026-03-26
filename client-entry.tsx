import config from './package.json' with { type: 'json' };
import { remarkTagUserAnchors, rehypeAnchorReturnLink } from './src/index';

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
    // remarkTagUserAnchors must run first to tag user-written anchors
    // before other remark plugins (e.g. remark-toc) add auto-generated links
    options.remarkPlugins = options.remarkPlugins ?? [];
    options.remarkPlugins.unshift(remarkTagUserAnchors);
    options.rehypePlugins = options.rehypePlugins ?? [];
    options.rehypePlugins.push(rehypeAnchorReturnLink);
    return options;
  };

  // エディタプレビュー用
  const originalGeneratePreviewOptions: OptionsGenerator | undefined =
    optionsGenerators.customGeneratePreviewOptions;
  optionsGenerators.customGeneratePreviewOptions = (...args: any[]) => {
    const options = (originalGeneratePreviewOptions ?? optionsGenerators.generatePreviewOptions)(...args);
    options.remarkPlugins = options.remarkPlugins ?? [];
    options.remarkPlugins.unshift(remarkTagUserAnchors);
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
