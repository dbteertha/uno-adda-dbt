(() => {
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
