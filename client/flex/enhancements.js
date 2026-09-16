(() => {
  const ensureStability = () => {
    if (window.DBT_STABILITY) return window.DBT_STABILITY;

    const defaults = {
      premiumCore: true,
      gameFeel: true,
      effects: true,
      analytics: true,
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
      failures.set(module, (failures.get(module) || 0) + 1);
      console.warn(`[DBT safe runtime] ${module}:`, error);
      return item;
    };
    window.addEventListener('error', (event) => {
      const target = event.target;
      if (target && target !== window && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        record('asset-load', new Error(`Failed to load ${target.src || target.href || 'asset'}`));
        return;
      }
      if (event.error) record('window', event.error, { file:event.filename || '' });
    }, true);
    window.addEventListener('unhandledrejection', (event) => record('promise', event.reason));

    const feature = (name) => flags[name] !== false;
    const disable = (name, reason = 'disabled') => { flags[name] = false; record(`feature:${name}`, new Error(reason)); };
    const guard = (name, fn) => { try { return fn(); } catch (error) { record(name, error); return undefined; } };
    const guardAsync = async (name, fn) => { try { return await fn(); } catch (error) { record(name, error); return undefined; } };

    const style = (name, href, options = {}) => new Promise((resolve) => {
      if (!feature(options.feature || name)) return resolve(false);
      const selector = options.selector || `link[data-dbt-module="${name}"]`;
      if (document.querySelector(selector)) return resolve(true);
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href; link.dataset.dbtModule = name;
      if (options.dataset) Object.assign(link.dataset, options.dataset);
      link.onload = () => resolve(true);
      link.onerror = () => { record(name, new Error(`Style failed: ${href}`)); resolve(false); };
      document.head.appendChild(link);
    });

    const script = (name, src, options = {}) => new Promise((resolve) => {
      if (!feature(options.feature || name)) return resolve(false);
      const selector = options.selector || `script[data-dbt-module="${name}"]`;
      const existing = document.querySelector(selector);
      if (existing) {
        if (options.ready?.()) return resolve(true);
        const timer = setTimeout(() => resolve(!!options.ready?.()), options.timeout || 4000);
        existing.addEventListener('load', () => { clearTimeout(timer); resolve(true); }, { once:true });
        existing.addEventListener('error', () => { clearTimeout(timer); record(name, new Error(`Script failed: ${src}`)); resolve(false); }, { once:true });
        return;
      }
      const el = document.createElement('script');
      el.src = src; el.async = false; el.dataset.dbtModule = name;
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

  void stable.guardAsync('flex-premium-stack', async () => {
    await stable.style('premium-core-css', '/premium-core.css?v=2', { feature:'premiumCore', selector:'link[data-premium-core]', dataset:{ premiumCore:'1' } });
    await stable.style('premium-gamefeel-css', '/premium-gamefeel.css?v=2', { feature:'gameFeel', selector:'link[data-premium-gamefeel]', dataset:{ premiumGamefeel:'1' } });
    await stable.style('premium-effects-css', '/premium-effects.css?v=2', { feature:'effects', selector:'link[data-premium-effects]', dataset:{ premiumEffects:'1' } });
    await stable.style('flex-premium-css', '/flex/flex-premium.css?v=2', { feature:'premiumCore', selector:'link[data-flex-premium]' });

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

  stable.guard('flex-enhancement-ui', () => {
    const toast = (msg) => {
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(toast.t);
      toast.t = setTimeout(() => { el.hidden = true; }, 2600);
    };

    const powerDialog = document.getElementById('power-dialog');
    const openPower = () => powerDialog?.showModal();
    document.getElementById('power-help')?.addEventListener('click', openPower);
    document.getElementById('lobby-power-help')?.addEventListener('click', openPower);
    document.getElementById('close-power-help')?.addEventListener('click', () => powerDialog?.close());

    const tutorialDialog = document.createElement('dialog');
    tutorialDialog.className = 'quick-tutorial-dialog';
    tutorialDialog.innerHTML = `
      <div class="mode-kicker">UNO FLEX · QUICK GUIDE</div>
      <h2>Flex in 30 seconds</h2>
      <div class="quick-guide-grid">
        <article><b>⚡ POWER ON</b><span>Lets you use a card's Flex side. Using a Flex side turns your Power OFF.</span></article>
        <article><b>↻ FLIP SYMBOL</b><span>Toggles your Power. Wild All Flip toggles everybody.</span></article>
        <article><b>🎨 FLEX MATCH</b><span>A Flex side can match with its secondary color when Power is ON.</span></article>
        <article><b>⏭ SPECIALS</b><span>Flex Skip, Reverse and Draw cards have stronger Flex-side effects.</span></article>
        <article><b>🌈 WILDS</b><span>Target players or make everyone draw depending on the Flex Wild.</span></article>
        <article><b>🚨 UNO</b><span>Call UNO at one card. If somebody catches you first, draw 2.</span></article>
      </div>
      <button id="close-quick-tutorial" class="primary wide" type="button">BACK TO WAITING ROOM</button>`;
    document.body.appendChild(tutorialDialog);
    document.getElementById('lobby-tutorial')?.addEventListener('click', () => tutorialDialog.showModal());
    tutorialDialog.querySelector('#close-quick-tutorial')?.addEventListener('click', () => tutorialDialog.close());

    const roomEl = document.getElementById('room-code-show');
    const shareBox = document.getElementById('flex-share-box');
    const shareInput = document.getElementById('flex-share-url');
    const copyButton = document.getElementById('copy-flex-link');

    const syncShareLink = () => {
      const code = roomEl?.textContent?.trim().toUpperCase();
      if (!code || code.length !== 4 || !shareBox || !shareInput) return;
      const url = `${location.origin}/room=${code}?mode=flex`;
      shareInput.value = url;
      shareBox.hidden = false;
      if (location.pathname.startsWith('/flex/')) history.replaceState({}, '', `/room=${code}?mode=flex`);
    };

    new MutationObserver(syncShareLink).observe(roomEl || document.body, { childList:true, subtree:true, characterData:true });
    syncShareLink();

    copyButton?.addEventListener('click', async () => {
      const url = shareInput?.value || '';
      if (!url) return;
      try { await navigator.clipboard.writeText(url); toast('Flex room link copied ✅'); }
      catch { toast(url); }
    });

    document.documentElement.dataset.dbtFlexCriticalReady = document.getElementById('create-flex') && document.getElementById('join-flex') ? '1' : '0';
    if (document.documentElement.dataset.dbtFlexCriticalReady !== '1') stable.record('flex-critical-dom', new Error('Flex create/join controls are missing'));
  });
})();