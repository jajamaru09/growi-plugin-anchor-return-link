import { remarkTagUserAnchors, rehypeAnchorReturnLink } from './src/index';

const PLUGIN_NAME = 'growi-plugin-anchor-return-link';

type OptionsGenerator = (...args: unknown[]) => GrowiMarkdownOptions;

interface GrowiMarkdownOptions {
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
}

interface GrowiOptionsGenerators {
  generateViewOptions?: OptionsGenerator;
  customGenerateViewOptions?: OptionsGenerator;
  generatePreviewOptions?: OptionsGenerator;
  customGeneratePreviewOptions?: OptionsGenerator;
}

interface GrowiFacade {
  markdownRenderer?: { optionsGenerators: GrowiOptionsGenerators };
}

interface HubPluginState {
  registration: { id: string };
  status: 'active' | 'disabled' | 'error';
}

interface HubLike {
  register?: (plugin: unknown) => void;
  unregister?: (id: string) => void;
  log?: (pluginId: string, ...args: unknown[]) => void;
  _getPluginStates?: () => HubPluginState[];
  _queue?: unknown[];
}

function getHub(): HubLike | undefined {
  return (window as unknown as { growiPluginHub?: HubLike }).growiPluginHub;
}

function getGrowiFacade(): GrowiFacade | undefined {
  return (window as unknown as { growiFacade?: GrowiFacade }).growiFacade;
}

const HUB_SETTINGS_KEY = 'growiPluginHub:settings';

/**
 * Log via hub if available; otherwise consult hub's persisted settings in localStorage
 * to respect the same debug gating. When settings aren't present or debug is off, stay silent.
 */
function log(...args: unknown[]): void {
  const hub = getHub();
  if (hub?.log) {
    hub.log(PLUGIN_NAME, ...args);
    return;
  }
  try {
    const raw = localStorage.getItem(HUB_SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { debug?: boolean; debugPlugins?: string[] };
    if (parsed.debug !== true) return;
    if (Array.isArray(parsed.debugPlugins) && parsed.debugPlugins.includes(PLUGIN_NAME)) return;
    console.log(`[${PLUGIN_NAME}]`, ...args);
  }
  catch {
    // localStorage unavailable or malformed settings — stay silent
  }
}

/** Register with hub immediately, or queue if hub is not yet loaded. */
function registerToHub(plugin: Record<string, unknown>): void {
  const hub = getHub();
  if (hub?.register) {
    log('hub is ready — registering directly');
    hub.register(plugin);
    return;
  }
  log('hub not ready — queueing registration');
  const w = window as unknown as { growiPluginHub?: HubLike };
  w.growiPluginHub ??= { _queue: [] } as HubLike;
  (w.growiPluginHub._queue as unknown[]).push(plugin);
}

/** Runtime-toggled flag. Wrappers read this to decide whether to apply the plugins. */
let enabled = true;

/** Wrapper-installation guard: install wrappers once per activate(). */
let wrappersInstalled = false;

/**
 * Synchronously check the plugin's current status with the hub and return the effective enabled state.
 * Used inside wrappers to close the race window between `reconcileSettings()` re-enabling the plugin
 * and `fireCurrentPageTo()`'s async dispatch landing on `onPageChange`.
 */
function isPluginEnabled(): boolean {
  if (enabled) return true;
  const hub = getHub();
  if (!hub?._getPluginStates) return false; // hub not ready or old API; trust flag
  const me = hub._getPluginStates().find(p => p.registration.id === PLUGIN_NAME);
  if (me && me.status === 'active') {
    enabled = true;
    log('wrapper detected hub status=active — re-syncing enabled flag');
    return true;
  }
  return false;
}

function installWrappers(): void {
  if (wrappersInstalled) {
    log('wrappers already installed — skip');
    return;
  }

  const growiFacade = getGrowiFacade();
  if (growiFacade?.markdownRenderer == null) {
    log('growiFacade.markdownRenderer not available — cannot install wrappers');
    return;
  }

  const { optionsGenerators } = growiFacade.markdownRenderer;

  // View mode (reader)
  const origView: OptionsGenerator | undefined
    = optionsGenerators.customGenerateViewOptions ?? optionsGenerators.generateViewOptions;
  if (typeof origView !== 'function') {
    log('generateViewOptions unavailable — cannot install view wrapper');
  }
  else {
    optionsGenerators.customGenerateViewOptions = (...args: unknown[]) => {
      const options = origView(...args);
      if (!isPluginEnabled()) {
        log('view wrapper: plugin disabled — pass through');
        return options;
      }
      options.remarkPlugins = options.remarkPlugins ?? [];
      options.remarkPlugins.unshift([remarkTagUserAnchors, { log, context: 'view' }]);
      options.rehypePlugins = options.rehypePlugins ?? [];
      options.rehypePlugins.push([rehypeAnchorReturnLink, { log, context: 'view' }]);
      return options;
    };
    log('view wrapper installed');
  }

  // Editor preview mode
  const origPreview: OptionsGenerator | undefined
    = optionsGenerators.customGeneratePreviewOptions ?? optionsGenerators.generatePreviewOptions;
  if (typeof origPreview !== 'function') {
    log('generatePreviewOptions unavailable — cannot install preview wrapper');
  }
  else {
    optionsGenerators.customGeneratePreviewOptions = (...args: unknown[]) => {
      const options = origPreview(...args);
      if (!isPluginEnabled()) {
        log('preview wrapper: plugin disabled — pass through');
        return options;
      }
      options.remarkPlugins = options.remarkPlugins ?? [];
      options.remarkPlugins.unshift([remarkTagUserAnchors, { log, context: 'preview' }]);
      options.rehypePlugins = options.rehypePlugins ?? [];
      options.rehypePlugins.push([rehypeAnchorReturnLink, { log, context: 'preview' }]);
      return options;
    };
    log('preview wrapper installed');
  }

  wrappersInstalled = true;
}

function activate(): void {
  log('activate() called');
  enabled = true;
  installWrappers();

  // Hub fires onDisable immediately on initial registration if the plugin is
  // in the disabled state (extension-hub >= registry fix). So simply implementing
  // onDisable is sufficient — no separate initial-state sync is needed.
  registerToHub({
    id: PLUGIN_NAME,
    label: 'アンカー戻りリンク',
    icon: 'south_west',
    order: 50,
    menuItem: false,
    onPageChange: (ctx: { pageId: string; mode: string }) => {
      enabled = true;
      log(`onPageChange: pageId=${ctx.pageId}, mode=${ctx.mode}`);
    },
    onDisable: () => {
      enabled = false;
      log('onDisable called — plugin gated off, wrappers pass through');
    },
  });

  log(`activate() finished (enabled=${enabled})`);
}

function deactivate(): void {
  log('deactivate() called');
  enabled = false;
  const hub = getHub();
  if (hub?.unregister) {
    hub.unregister(PLUGIN_NAME);
    log('unregistered from hub');
  }
  else {
    log('hub unavailable at deactivate — nothing to unregister');
  }
  // Note: we intentionally leave the customGenerate* wrappers in place to preserve
  // the plugin chain (removing them risks breaking other plugins that chained after us).
  // With enabled=false they pass through to the original generators transparently.
}

const w = window as unknown as {
  pluginActivators?: Record<string, { activate(): void; deactivate(): void }>;
};
if (w.pluginActivators == null) {
  w.pluginActivators = {};
}
w.pluginActivators[PLUGIN_NAME] = { activate, deactivate };
