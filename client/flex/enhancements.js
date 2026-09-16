(() => {
  if (!document.querySelector('link[data-premium-core]')) {
    const premiumCss = document.createElement('link');
    premiumCss.rel = 'stylesheet';
    premiumCss.href = '/premium-core.css?v=1';
    premiumCss.dataset.premiumCore = '1';
    document.head.appendChild(premiumCss);
  }

  if (!document.querySelector('link[data-premium-gamefeel]')) {
    const feelCss = document.createElement('link');
    feelCss.rel = 'stylesheet';
    feelCss.href = '/premium-gamefeel.css?v=1';
    feelCss.dataset.premiumGamefeel = '1';
    document.head.appendChild(feelCss);
  }

  if (!document.querySelector('link[data-premium-effects]')) {
    const effectsCss = document.createElement('link');
    effectsCss.rel = 'stylesheet';
    effectsCss.href = '/premium-effects.css?v=1';
    effectsCss.dataset.premiumEffects = '1';
    document.head.appendChild(effectsCss);
  }

  const loadEffects = () => {
    if (document.querySelector('script[data-premium-effects]')) return;
    const effects = document.createElement('script');
    effects.src = '/premium-effects.js?v=1';
    effects.dataset.premiumEffects = '1';
    document.body.appendChild(effects);
  };

  const loadGameFeel = () => {
    if (document.querySelector('script[data-premium-gamefeel]')) {
      if (window.DBT_GAMEFEEL_V1) loadEffects();
      else document.querySelector('script[data-premium-gamefeel]')?.addEventListener('load', loadEffects, { once:true });
      return;
    }
    const feel = document.createElement('script');
    feel.src = '/premium-gamefeel.js?v=1';
    feel.dataset.premiumGamefeel = '1';
    feel.onload = loadEffects;
    document.body.appendChild(feel);
  };

  if (!document.querySelector('script[data-premium-core]')) {
    const premium = document.createElement('script');
    premium.src = '/premium-core.js?v=1';
    premium.dataset.premiumCore = '1';
    premium.onload = loadGameFeel;
    document.body.appendChild(premium);
  } else if (window.DBT_UI) {
    loadGameFeel();
  } else {
    document.querySelector('script[data-premium-core]')?.addEventListener('load', loadGameFeel, { once:true });
  }

  if (!document.querySelector('script[data-analytics]')) {
    const analytics = document.createElement('script');
    analytics.src = '/analytics.js?v=1';
    analytics.dataset.analytics = '1';
    document.body.appendChild(analytics);
  }

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/flex/flex-premium.css';
  document.head.appendChild(css);

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

  new MutationObserver(syncShareLink).observe(roomEl || document.body, { childList: true, subtree: true, characterData: true });
  syncShareLink();

  copyButton?.addEventListener('click', async () => {
    const url = shareInput?.value || '';
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast('Flex room link copied ✅'); }
    catch { toast(url); }
  });
})();