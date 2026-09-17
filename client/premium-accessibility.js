(() => {
  if (window.DBT_ACCESSIBILITY_V3) return;
  window.DBT_ACCESSIBILITY_V3 = true;

  const stable = window.DBT_STABILITY;
  const root = document.documentElement;
  const key = 'dbt-accessibility-v1';
  const isFlex = location.pathname.startsWith('/flex');
  const safe = (name, fn) => {
    try {
      const result = fn();
      if (result && typeof result.catch === 'function') result.catch((error) => stable?.record?.(`a11y:${name}`, error));
      return result;
    } catch (error) {
      stable?.record?.(`a11y:${name}`, error);
      return undefined;
    }
  };
  const mq = (query) => {
    try { return window.matchMedia?.(query)?.matches ?? false; }
    catch { return false; }
  };

  const defaults = {
    reduceMotion: mq('(prefers-reduced-motion: reduce)'),
    highContrast: mq('(prefers-contrast: more)'),
    largeText: false,
    colorSymbols: false,
    lowEnd: !!navigator.connection?.saveData || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4,
    keepAwake: false,
  };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  const settings = { ...defaults, ...saved };

  const apply = () => safe('apply', () => {
    root.classList.toggle('dbt-reduce-motion', !!settings.reduceMotion);
    root.classList.toggle('dbt-high-contrast', !!settings.highContrast);
    root.classList.toggle('dbt-large-text', !!settings.largeText);
    root.classList.toggle('dbt-color-symbols', !!settings.colorSymbols);
    root.classList.toggle('dbt-lite-force', !!settings.lowEnd);
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
    window.DBT_UI?.emit?.('accessibilitychange', { ...settings });
  });
  apply();

  const live = document.createElement('div');
  live.id = 'dbt-a11y-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  document.body.appendChild(live);
  let announceTimer = 0;
  const announce = (text) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      live.textContent = '';
      requestAnimationFrame(() => { live.textContent = clean.slice(0, 240); });
    }, 120);
  };

  const enhancementsStyle = document.createElement('style');
  enhancementsStyle.id = 'dbt-session-qol-style';
  enhancementsStyle.textContent = `
    :root{--dbt-vh:1vh}
    html.dbt-page-hidden .orb,html.dbt-page-hidden .dbt-fx-particle,html.dbt-page-hidden .dbt-special-fx{animation-play-state:paused!important}
    html.dbt-save-data :where(.orb,.dbt-fx-particle,.dbt-special-fx i){display:none!important}
    html.dbt-input-keyboard :where(button,a,[tabindex]):focus-visible{outline-offset:4px!important}
    #dbt-network-quality{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:11px;font-weight:800;letter-spacing:.04em;white-space:nowrap}
    #dbt-network-quality::before{content:'';width:7px;height:7px;border-radius:50%;background:#5ee58b;box-shadow:0 0 9px currentColor}
    #dbt-network-quality[data-quality='slow']::before{background:#ffca5c}
    #dbt-network-quality[data-quality='offline']::before{background:#ff6f7d}
    #dbt-network-quality[data-quality='unknown']::before{background:#91a7b8}
    #dbt-share-game{min-width:42px;min-height:42px;border-radius:12px}
    html.dbt-landscape-phone #dbt-a11y-panel{max-height:calc(100dvh - 10px)}
    @media (max-width:720px){#dbt-network-quality{max-width:96px;overflow:hidden;text-overflow:ellipsis}#dbt-share-game{min-width:44px;min-height:44px}}
    @media (pointer:coarse){:where(button,.game-tile,input[type='checkbox']){min-height:44px}.dbt-a11y-toggle{padding-block:15px}}
  `;
  document.head.appendChild(enhancementsStyle);

  const dialog = document.createElement('dialog');
  dialog.id = 'dbt-a11y-panel';
  dialog.setAttribute('aria-labelledby', 'dbt-a11y-title');
  dialog.setAttribute('aria-describedby', 'dbt-a11y-description');
  dialog.innerHTML = `
    <div class="dbt-a11y-inner">
      <div class="dbt-a11y-head"><div><small>DBT GAMES · ACCESSIBILITY</small><h2 id="dbt-a11y-title">Comfort & performance</h2></div><button class="dbt-a11y-close" type="button" aria-label="Close accessibility settings">×</button></div>
      <p class="dbt-a11y-copy" id="dbt-a11y-description">These settings only change presentation and controls. Card rules and match state stay untouched.</p>
      <div class="dbt-a11y-grid">
        <label class="dbt-a11y-toggle"><span><b>Reduce motion</b><small>Minimize transitions, camera hits and animated effects.</small></span><input data-setting="reduceMotion" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>High contrast</b><small>Strengthen borders and muted text for easier reading.</small></span><input data-setting="highContrast" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>Larger text</b><small>Increase interface text without changing game logic.</small></span><input data-setting="largeText" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>Color symbols / patterns</b><small>Add patterns so card colors are not identified by color alone.</small></span><input data-setting="colorSymbols" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>Low-end mode</b><small>Reduce blur, particles, shadows and visual load.</small></span><input data-setting="lowEnd" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>Keep screen awake</b><small>Ask supported devices to keep the display on while a match is visible.</small></span><input data-setting="keepAwake" type="checkbox"></label>
      </div>
      <div class="dbt-a11y-actions"><button id="dbt-install-app" type="button" hidden>Install DBT Games</button><button id="dbt-share-current" type="button">Share game</button><button id="dbt-a11y-reset" type="button">Reset settings</button></div>
      <div class="dbt-a11y-shortcuts"><b>Keyboard:</b> <kbd>D</kbd> Draw · <kbd>U</kbd> UNO · <kbd>P</kbd> Pass · <kbd>←</kbd>/<kbd>→</kbd> Game rail · <kbd>?</kbd> Accessibility · <kbd>Esc</kbd> Close dialog</div>
    </div>`;
  document.body.appendChild(dialog);

  const openButton = document.createElement('button');
  openButton.id = 'dbt-a11y-open';
  openButton.type = 'button';
  openButton.title = 'Accessibility & performance';
  openButton.setAttribute('aria-label', 'Accessibility and performance settings');
  openButton.textContent = '♿';
  const host = document.querySelector('.top-actions') || document.querySelector('.flex-top') || document.body;
  host.appendChild(openButton);

  const shareButton = document.createElement('button');
  shareButton.id = 'dbt-share-game';
  shareButton.type = 'button';
  shareButton.title = 'Share DBT Games';
  shareButton.setAttribute('aria-label', 'Share DBT Games');
  shareButton.textContent = '↗';
  host.insertBefore(shareButton, openButton);

  const networkQuality = document.createElement('span');
  networkQuality.id = 'dbt-network-quality';
  networkQuality.setAttribute('role', 'status');
  networkQuality.setAttribute('aria-live', 'polite');
  host.insertBefore(networkQuality, shareButton);

  const syncInputs = () => dialog.querySelectorAll('[data-setting]').forEach((input) => {
    input.checked = !!settings[input.dataset.setting];
  });
  syncInputs();

  let returnFocus = null;
  const openDialog = () => safe('open', () => {
    syncInputs();
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : openButton;
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('.dbt-a11y-close')?.focus());
  });
  const closeDialog = () => { if (dialog.open) dialog.close(); };
  openButton.addEventListener('click', openDialog);
  dialog.querySelector('.dbt-a11y-close')?.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener('close', () => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  });

  let wakeLock = null;
  const matchVisible = () => {
    const candidates = [document.getElementById('board'), document.getElementById('game')].filter(Boolean);
    return candidates.some((el) => !el.hidden && getComputedStyle(el).display !== 'none');
  };
  const releaseWakeLock = async () => {
    const lock = wakeLock;
    wakeLock = null;
    if (lock && !lock.released) try { await lock.release(); } catch {}
  };
  const syncWakeLock = () => safe('wake-lock', async () => {
    const shouldHold = !!settings.keepAwake && document.visibilityState === 'visible' && matchVisible();
    if (!shouldHold) { await releaseWakeLock(); return; }
    if (wakeLock || !navigator.wakeLock?.request) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; }, { once:true });
  });

  dialog.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('change', () => safe('setting', () => {
    settings[input.dataset.setting] = input.checked;
    apply();
    syncWakeLock();
    announce(`${input.closest('label')?.querySelector('b')?.textContent || 'Setting'} ${input.checked ? 'on' : 'off'}`);
  })));
  dialog.querySelector('#dbt-a11y-reset')?.addEventListener('click', () => safe('reset', () => {
    Object.assign(settings, defaults);
    apply(); syncInputs(); syncWakeLock(); announce('Accessibility settings reset');
  }));

  const shareCurrent = () => safe('share', async () => {
    const data = { title: document.title || 'DBT Games', text: 'Play DBT Games with me', url: location.href };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (error) { if (error?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(location.href);
      window.DBT_UI?.toast?.('Game link copied', 'info');
      announce('Game link copied');
    } catch {
      window.prompt('Copy this game link', location.href);
    }
  });
  shareButton.addEventListener('click', shareCurrent);
  dialog.querySelector('#dbt-share-current')?.addEventListener('click', shareCurrent);

  const colorNames = { RED:'Red', YELLOW:'Yellow', GREEN:'Green', BLUE:'Blue' };
  const improveNode = (node) => safe('names', () => {
    if (!(node instanceof Element)) return;
    const nodes = [node, ...node.querySelectorAll('button:not([aria-label]),[data-color]')];
    for (const el of nodes) {
      if (el.matches?.('button:not([aria-label])')) {
        const title = el.getAttribute('title') || el.textContent?.replace(/\s+/g, ' ').trim();
        if (title && title.length <= 80) el.setAttribute('aria-label', title);
      }
      if (el.matches?.('[data-color]') && !el.getAttribute('aria-label')) {
        const color = String(el.dataset.color || '').toUpperCase();
        if (colorNames[color]) el.setAttribute('aria-label', `${colorNames[color]} color`);
      }
    }
  });
  improveNode(document.body);
  const hand = document.getElementById('hand');
  if (hand && !hand.getAttribute('aria-label')) hand.setAttribute('aria-label', 'Your cards');

  const pendingNodes = new Set();
  let namesQueued = false;
  const flushNames = () => {
    namesQueued = false;
    for (const node of pendingNodes) improveNode(node);
    pendingNodes.clear();
    syncWakeLock();
  };
  const namesObserver = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) pendingNodes.add(node);
    if (!namesQueued && pendingNodes.size) {
      namesQueued = true;
      requestAnimationFrame(flushNames);
    }
  });
  namesObserver.observe(document.body, { childList:true, subtree:true });

  const observeText = (el) => {
    if (!el) return;
    let last = el.textContent?.replace(/\s+/g, ' ').trim() || '';
    new MutationObserver(() => {
      const now = el.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (now && now !== last) { last = now; announce(now); }
    }).observe(el, { childList:true, subtree:true, characterData:true });
  };
  observeText(document.getElementById(isFlex ? 'status' : 'turn'));
  observeText(document.getElementById('action-log'));
  observeText(document.getElementById('disconnect'));

  const rail = document.querySelector('.game-rail');
  if (rail) {
    const syncRailTabs = () => {
      const tiles = [...rail.querySelectorAll('.game-tile')];
      const active = tiles.find((tile) => tile.classList.contains('active')) || tiles[0];
      tiles.forEach((tile) => tile.tabIndex = tile === active ? 0 : -1);
    };
    syncRailTabs();
    rail.addEventListener('keydown', (event) => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const tiles = [...rail.querySelectorAll('.game-tile')];
      if (!tiles.length) return;
      const current = Math.max(0, tiles.indexOf(document.activeElement));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tiles.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tiles.length) % tiles.length;
      event.preventDefault();
      tiles[next].tabIndex = 0;
      tiles[current].tabIndex = -1;
      tiles[next].focus();
      tiles[next].scrollIntoView({ block:'nearest', inline:'nearest', behavior: settings.reduceMotion ? 'auto' : 'smooth' });
    });
  }

  const clickControl = (id) => {
    const el = document.getElementById(id);
    if (!el || el.hidden || el.disabled || getComputedStyle(el).display === 'none') return false;
    el.click(); return true;
  };
  document.addEventListener('keydown', (event) => safe('keyboard', () => {
    root.classList.add('dbt-input-keyboard');
    root.classList.remove('dbt-input-pointer');
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) { event.preventDefault(); if (!dialog.open) openDialog(); return; }
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); closeDialog(); return; }
    if (dialog.open) return;
    const keyLower = event.key.toLowerCase();
    const handled = keyLower === 'd' ? clickControl('draw') : keyLower === 'u' ? clickControl('uno') : keyLower === 'p' ? clickControl('pass') : false;
    if (handled) event.preventDefault();
  }));
  document.addEventListener('pointerdown', () => {
    root.classList.add('dbt-input-pointer');
    root.classList.remove('dbt-input-keyboard');
  }, { passive:true });

  let onlineInitialized = false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const updateNetworkQuality = () => {
    const offline = !navigator.onLine;
    const effective = connection?.effectiveType || '';
    const saveData = !!connection?.saveData;
    const rtt = Number(connection?.rtt || 0);
    const slow = offline || saveData || effective === 'slow-2g' || effective === '2g' || rtt >= 700;
    root.classList.toggle('dbt-offline', offline);
    root.classList.toggle('dbt-save-data', saveData);
    networkQuality.dataset.quality = offline ? 'offline' : slow ? 'slow' : effective ? 'good' : 'unknown';
    networkQuality.textContent = offline ? 'Offline' : saveData ? 'Data saver' : effective ? effective.toUpperCase() : 'Online';
    networkQuality.title = offline ? 'No network connection' : `Network ${effective || 'online'}${rtt ? ` · ${rtt}ms RTT` : ''}${saveData ? ' · data saver' : ''}`;
  };
  const setOnline = () => {
    const offline = !navigator.onLine;
    updateNetworkQuality();
    if (onlineInitialized) announce(offline ? 'Device offline. Reconnecting when network returns.' : 'Back online');
    onlineInitialized = true;
  };
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  connection?.addEventListener?.('change', updateNetworkQuality);
  setOnline();

  const syncViewport = () => {
    root.style.setProperty('--dbt-vh', `${window.innerHeight * 0.01}px`);
    root.classList.toggle('dbt-landscape-phone', window.innerWidth > window.innerHeight && window.innerHeight <= 540);
  };
  syncViewport();
  window.addEventListener('resize', syncViewport, { passive:true });
  window.visualViewport?.addEventListener?.('resize', syncViewport, { passive:true });

  const syncVisibility = () => {
    root.classList.toggle('dbt-page-hidden', document.visibilityState !== 'visible');
    syncWakeLock();
    if (document.visibilityState === 'visible') updateNetworkQuality();
  };
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pagehide', releaseWakeLock);
  window.addEventListener('pageshow', () => { syncVisibility(); syncViewport(); });
  syncVisibility();

  let longTasks = [];
  if ('PerformanceObserver' in window) safe('performance-observer', () => {
    const observer = new PerformanceObserver((list) => {
      const now = performance.now();
      for (const entry of list.getEntries()) if (entry.duration >= 80) longTasks.push(now);
      longTasks = longTasks.filter(t => now - t < 15000);
      if (longTasks.length >= 6 && !settings.lowEnd) {
        settings.lowEnd = true; apply(); syncInputs();
        window.DBT_UI?.toast?.('Low-end mode enabled to keep gameplay smooth', 'info');
        announce('Low-end mode enabled to keep gameplay smooth');
        longTasks = [];
      }
    });
    observer.observe({ type:'longtask', buffered:true });
  });

  let installPrompt = null;
  const installButton = dialog.querySelector('#dbt-install-app');
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); installPrompt = event; installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
    announce('DBT Games installed');
  });
  installButton?.addEventListener('click', () => safe('install', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null; installButton.hidden = true;
  }));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => safe('service-worker', async () => {
      const registration = await navigator.serviceWorker.register('/sw.js?v=pwa-6', { scope:'/' });
      if (registration.waiting) announce('A DBT Games update is ready for the next reload.');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce('A DBT Games update is ready for the next reload.');
        });
      });
    }));
  }

  window.DBT_ACCESSIBILITY = Object.freeze({ settings, apply, announce, open:openDialog, share:shareCurrent, syncWakeLock, updateNetworkQuality });
})();
