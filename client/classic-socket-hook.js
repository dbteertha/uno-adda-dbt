(() => {
  const ensureStability = () => {
    if (window.DBT_STABILITY) return window.DBT_STABILITY;

    const defaults = {
      premiumCore: true,
      gameFeel: true,
      effects: true,
      analytics: true,
      cinematic: true,
      fun: true,
      admin: new URLSearchParams(location.search).get('edit') === '1',
      commentary: true,
      audio: false,
      voice: false,
      social: false,
      progression: false,
      advanced: false,
    };

    let stored = {};
    try { stored = JSON.parse(sessionStorage.getItem('dbt-feature-overrides') || '{}') || {}; } catch {}
    const flags = { ...defaults, ...stored, ...(window.DBT_FEATURE_OVERRIDES || {}) };
    const errors = [];
    const failures = new Map();

    const record = (module, error, extra = {}) => {
      const message = error instanceof Error ? error.message : String(error || 'Unknown error');
      const item = { module, message, at: Date.now(), ...extra };
      errors.push(item);
      if (errors.length > 60) errors.shift();
      const count = (failures.get(module) || 0) + 1;
      failures.set(module, count);
      console.warn(`[DBT safe runtime] ${module}:`, error);
      return item;
    };

    window.addEventListener('error', (event) => {
      const target = event.target;
      if (target && target !== window && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        record('asset-load', new Error(`Failed to load ${target.src || target.href || 'asset'}`));
        return;
      }
      if (event.error) record('window', event.error, { file: event.filename || '' });
    }, true);
    window.addEventListener('unhandledrejection', (event) => record('promise', event.reason));

    const feature = (name) => flags[name] !== false;
    const disable = (name, reason = 'disabled') => {
      flags[name] = false;
      record(`feature:${name}`, new Error(reason));
    };
    const guard = (name, fn) => {
      try { return fn(); }
      catch (error) { record(name, error); return undefined; }
    };
    const guardAsync = async (name, fn) => {
      try { return await fn(); }
      catch (error) { record(name, error); return undefined; }
    };

    const style = (name, href, options = {}) => new Promise((resolve) => {
      const featureName = options.feature || name;
      if (!feature(featureName)) return resolve(false);
      const selector = options.selector || `link[data-dbt-module="${name}"]`;
      const existing = document.querySelector(selector);
      if (existing) return resolve(true);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.dbtModule = name;
      if (options.dataset) Object.assign(link.dataset, options.dataset);
      link.onload = () => resolve(true);
      link.onerror = () => { record(name, new Error(`Style failed: ${href}`)); resolve(false); };
      document.head.appendChild(link);
    });

    const script = (name, src, options = {}) => new Promise((resolve) => {
      const featureName = options.feature || name;
      if (!feature(featureName)) return resolve(false);
      const selector = options.selector || `script[data-dbt-module="${name}"]`;
      const existing = document.querySelector(selector);
      if (existing) {
        if (options.ready?.()) return resolve(true);
        const timer = setTimeout(() => resolve(!!options.ready?.()), options.timeout || 4000);
        existing.addEventListener('load', () => { clearTimeout(timer); resolve(true); }, { once: true });
        existing.addEventListener('error', () => { clearTimeout(timer); record(name, new Error(`Script failed: ${src}`)); resolve(false); }, { once: true });
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.dataset.dbtModule = name;
      if (options.dataset) Object.assign(el.dataset, options.dataset);
      const timer = setTimeout(() => { record(name, new Error(`Script timeout: ${src}`)); resolve(false); }, options.timeout || 8000);
      el.onload = () => { clearTimeout(timer); resolve(true); };
      el.onerror = () => { clearTimeout(timer); record(name, new Error(`Script failed: ${src}`)); resolve(false); };
      document.body.appendChild(el);
    });

    window.DBT_STABILITY = { flags, errors, failures, feature, disable, record, guard, guardAsync, script, style };
    document.documentElement.dataset.dbtStableRuntime = '1';
    return window.DBT_STABILITY;
  };

  const stable = ensureStability();
  const original = window.io;
  if (typeof original !== 'function') {
    stable.record('classic-socket-hook', new Error('Socket.IO client is unavailable'));
    return;
  }

  const wrapped = function(...args) {
    const socket = original(...args);
    const first = args[0];
    if (!first || typeof first === 'object') window.DBT_CLASSIC_SOCKET = socket;
    return socket;
  };
  Object.assign(wrapped, original);
  window.io = wrapped;

  window.addEventListener('load', () => {
    void stable.guardAsync('classic-premium-stack', async () => {
      await stable.style('premium-core-css', '/premium-core.css?v=2', { feature:'premiumCore', selector:'link[data-premium-core]', dataset:{ premiumCore:'1' } });
      await stable.style('premium-gamefeel-css', '/premium-gamefeel.css?v=2', { feature:'gameFeel', selector:'link[data-premium-gamefeel]', dataset:{ premiumGamefeel:'1' } });
      await stable.style('premium-effects-css', '/premium-effects.css?v=2', { feature:'effects', selector:'link[data-premium-effects]', dataset:{ premiumEffects:'1' } });

      const core = await stable.script('premium-core', '/premium-core.js?v=2', {
        feature:'premiumCore', selector:'script[data-premium-core]', ready:() => !!window.DBT_UI, dataset:{ premiumCore:'1' }
      });
      if (!core) return;
      const feel = await stable.script('premium-gamefeel', '/premium-gamefeel.js?v=2', {
        feature:'gameFeel', selector:'script[data-premium-gamefeel]', ready:() => !!window.DBT_GAMEFEEL_V1, dataset:{ premiumGamefeel:'1' }
      });
      if (!feel) return;
      await stable.script('premium-effects', '/premium-effects.js?v=2', {
        feature:'effects', selector:'script[data-premium-effects]', ready:() => !!window.DBT_EFFECTS_V1, dataset:{ premiumEffects:'1' }
      });
    });

    void stable.script('analytics', '/analytics.js?v=2', { feature:'analytics', selector:'script[data-analytics]', dataset:{ analytics:'1' } });

    void stable.guardAsync('classic-cinematic-stack', async () => {
      if (!stable.feature('cinematic')) return;
      const flow = await stable.script('cinematic-flow', '/cinematic-flow.js?v=2', { feature:'cinematic', selector:'script[data-cinematic-flow]', dataset:{ cinematicFlow:'1' } });
      if (!flow) return;
      const intro = await stable.script('cinematic-intro', '/cinematic-intro.js?v=3', { feature:'cinematic', selector:'script[data-cinematic-intro]', dataset:{ cinematicIntro:'1' } });
      if (!intro) return;
      await stable.script('cinematic-professional', '/cinematic-professional.js?v=3', { feature:'cinematic', selector:'script[data-cinematic-professional]', dataset:{ cinematicProfessional:'1' } });
    });

    void stable.script('fun-mode', '/fun-mode.js?v=2', { feature:'fun', selector:'script[data-fun-mode]', dataset:{ funMode:'1' } });

    if (stable.feature('admin')) {
      void stable.guardAsync('classic-admin-stack', async () => {
        await stable.script('admin-lock', '/admin-lock.js?v=hidden-editor-6', { feature:'admin', selector:'script[data-admin-lock]', dataset:{ adminLock:'1' } });
        await stable.script('admin-key-fix', '/admin-key-fix.js?v=3', { feature:'admin', selector:'script[data-admin-key-fix]', dataset:{ adminKeyFix:'1' } });
        await stable.script('admin-persistence', '/admin-persistence.js?v=2', { feature:'admin', selector:'script[data-admin-persistence]', dataset:{ adminPersistence:'1' } });
        await stable.script('admin-runtime', '/admin-runtime.js?v=persist-2', { feature:'admin', selector:'script[data-admin-runtime]', dataset:{ adminRuntime:'1' } });
        await stable.script('admin-save-fix', '/admin-save-fix.js?v=4', { feature:'admin', selector:'script[data-admin-save-fix]', dataset:{ adminSaveFix:'1' } });
        await stable.script('admin-undo-redo', '/admin-undo-redo.js?v=3', { feature:'admin', selector:'script[data-admin-undo-redo]', dataset:{ adminUndoRedo:'1' } });
      });
    }

    if (window.DBT_CLASSIC_SOCKET) {
      void stable.script('mr-bean-commentary', '/mr-bean-commentary.js?v=2', {
        feature:'commentary', selector:'script[data-mr-bean-commentary]', dataset:{ mrBeanCommentary:'1' }
      });
    }

    document.documentElement.dataset.dbtCriticalReady = document.getElementById('home-play-uno') ? '1' : '0';
    if (!document.getElementById('home-play-uno')) stable.record('critical-dom', new Error('PLAY UNO button is missing'));
  }, { once: true });
})();