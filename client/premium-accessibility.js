(() => {
  if (window.DBT_ACCESSIBILITY_V1) return;
  window.DBT_ACCESSIBILITY_V1 = true;

  const stable = window.DBT_STABILITY;
  const root = document.documentElement;
  const key = 'dbt-accessibility-v1';
  const isFlex = location.pathname.startsWith('/flex');
  const safe = (name, fn) => {
    try { return fn(); }
    catch (error) { stable?.record?.(`a11y:${name}`, error); return undefined; }
  };

  const defaults = {
    reduceMotion: matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
    highContrast: matchMedia?.('(prefers-contrast: more)')?.matches ?? false,
    largeText: false,
    colorSymbols: false,
    lowEnd: !!navigator.connection?.saveData || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4,
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
    announceTimer = setTimeout(() => { live.textContent = clean.slice(0, 240); }, 120);
  };

  const dialog = document.createElement('dialog');
  dialog.id = 'dbt-a11y-panel';
  dialog.innerHTML = `
    <div class="dbt-a11y-inner">
      <div class="dbt-a11y-head"><div><small>DBT GAMES · ACCESSIBILITY</small><h2>Comfort & performance</h2></div><button class="dbt-a11y-close" type="button" aria-label="Close accessibility settings">×</button></div>
      <p class="dbt-a11y-copy">These settings only change presentation and controls. Card rules and match state stay untouched.</p>
      <div class="dbt-a11y-grid">
        <label class="dbt-a11y-toggle"><span><b>Reduce motion</b><small>Minimize transitions, camera hits and animated effects.</small></span><input data-setting="reduceMotion" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>High contrast</b><small>Strengthen borders and muted text for easier reading.</small></span><input data-setting="highContrast" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>Larger text</b><small>Increase interface text without changing game logic.</small></span><input data-setting="largeText" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>Color symbols / patterns</b><small>Add patterns so card colors are not identified by color alone.</small></span><input data-setting="colorSymbols" type="checkbox"></label>
        <label class="dbt-a11y-toggle"><span><b>Low-end mode</b><small>Reduce blur, particles, shadows and visual load.</small></span><input data-setting="lowEnd" type="checkbox"></label>
      </div>
      <div class="dbt-a11y-actions"><button id="dbt-install-app" type="button" hidden>Install DBT Games</button><button id="dbt-a11y-reset" type="button">Reset settings</button></div>
      <div class="dbt-a11y-shortcuts"><b>Keyboard:</b> <kbd>D</kbd> Draw · <kbd>U</kbd> UNO · <kbd>P</kbd> Pass · <kbd>?</kbd> Accessibility · <kbd>Esc</kbd> Close dialog</div>
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

  const syncInputs = () => dialog.querySelectorAll('[data-setting]').forEach((input) => {
    input.checked = !!settings[input.dataset.setting];
  });
  syncInputs();

  openButton.addEventListener('click', () => safe('open', () => {
    syncInputs();
    if (!dialog.open) dialog.showModal();
  }));
  dialog.querySelector('.dbt-a11y-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('change', () => safe('setting', () => {
    settings[input.dataset.setting] = input.checked;
    apply();
  })));
  dialog.querySelector('#dbt-a11y-reset')?.addEventListener('click', () => safe('reset', () => {
    Object.assign(settings, defaults);
    apply(); syncInputs(); announce('Accessibility settings reset');
  }));

  const colorNames = { RED:'Red', YELLOW:'Yellow', GREEN:'Green', BLUE:'Blue' };
  const improveNames = () => safe('names', () => {
    document.querySelectorAll('button:not([aria-label])').forEach((button) => {
      const title = button.getAttribute('title') || button.textContent?.replace(/\s+/g, ' ').trim();
      if (title && title.length <= 80) button.setAttribute('aria-label', title);
    });
    document.querySelectorAll('[data-color]').forEach((el) => {
      const color = String(el.dataset.color || '').toUpperCase();
      if (colorNames[color] && !el.getAttribute('aria-label')) el.setAttribute('aria-label', `${colorNames[color]} color`);
    });
    const hand = document.getElementById('hand');
    if (hand && !hand.getAttribute('aria-label')) hand.setAttribute('aria-label', 'Your cards');
  });
  improveNames();

  let namesQueued = false;
  const namesObserver = new MutationObserver(() => {
    if (namesQueued) return;
    namesQueued = true;
    requestAnimationFrame(() => { namesQueued = false; improveNames(); });
  });
  namesObserver.observe(document.body, { childList:true, subtree:true });

  const observeText = (el) => {
    if (!el) return;
    let last = '';
    new MutationObserver(() => {
      const now = el.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (now && now !== last) { last = now; announce(now); }
    }).observe(el, { childList:true, subtree:true, characterData:true });
  };
  observeText(document.getElementById(isFlex ? 'status' : 'turn'));
  observeText(document.getElementById('action-log'));
  observeText(document.getElementById('disconnect'));

  const clickControl = (id) => {
    const el = document.getElementById(id);
    if (!el || el.hidden || el.disabled || getComputedStyle(el).display === 'none') return false;
    el.click(); return true;
  };
  document.addEventListener('keydown', (event) => safe('keyboard', () => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) { event.preventDefault(); if (!dialog.open) dialog.showModal(); return; }
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); dialog.close(); return; }
    if (dialog.open) return;
    const keyLower = event.key.toLowerCase();
    const handled = keyLower === 'd' ? clickControl('draw') : keyLower === 'u' ? clickControl('uno') : keyLower === 'p' ? clickControl('pass') : false;
    if (handled) event.preventDefault();
  }));

  const setOnline = () => {
    root.classList.toggle('dbt-offline', !navigator.onLine);
    announce(navigator.onLine ? 'Back online' : 'Device offline. Reconnecting when network returns.');
  };
  window.addEventListener('online', setOnline); window.addEventListener('offline', setOnline); setOnline();

  let longTasks = [];
  if ('PerformanceObserver' in window) safe('performance-observer', () => {
    const observer = new PerformanceObserver((list) => {
      const now = performance.now();
      for (const entry of list.getEntries()) if (entry.duration >= 80) longTasks.push(now);
      longTasks = longTasks.filter(t => now - t < 15000);
      if (longTasks.length >= 6 && !settings.lowEnd) {
        settings.lowEnd = true; apply(); syncInputs();
        window.DBT_UI?.toast?.('Low-end mode enabled to keep gameplay smooth', 'info');
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
  installButton?.addEventListener('click', async () => safe('install', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null; installButton.hidden = true;
  }));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => safe('service-worker', async () => {
      const registration = await navigator.serviceWorker.register('/sw.js?v=pwa-5', { scope:'/' });
      if (registration.waiting) announce('A DBT Games update is ready for the next reload.');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce('A DBT Games update is ready for the next reload.');
        });
      });
    }));
  }

  window.DBT_ACCESSIBILITY = Object.freeze({ settings, apply, announce, open:() => dialog.showModal() });
})();
