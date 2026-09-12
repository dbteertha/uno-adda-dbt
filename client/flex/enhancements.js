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

  const powerDefs = {
    MAGNET: { icon:'🧲', name:'MAGNET', desc:"Pulls one random card from a selected opponent's hand. A Shield blocks it." },
    SHIELD: { icon:'🛡️', name:'SHIELD', desc:'Activate it on your turn. It blocks the next DBT Power Card used against you, then disappears.' },
    TIME_FREEZE: { icon:'⏱️', name:'TIME FREEZE', desc:'Arms the next player’s turn with a strict 3-second timer. If they do nothing, the server auto-passes their turn. Shield blocks it.' },
    ROBBERY: { icon:'🥷', name:'ROBBERY', desc:'Choose an opponent. That opponent chooses which one of their remaining DBT Power Cards you steal. Shield blocks it.' },
  };
  const targetPowers = new Set(['MAGNET','ROBBERY']);
  const allPowerKinds = Object.keys(powerDefs);
  let latestState = null;
  let selectedPower = null;
  let powerIntroShown = false;
  let timerTick = null;

  const socket = window.FLEX_SOCKET;
  if (!socket) console.warn('[UNO Flex] socket hook unavailable');

  // Make PASS impossible to miss and ensure only one button exists.
  const passButtons = [...document.querySelectorAll('#flex-pass')];
  const passButton = passButtons.shift();
  passButtons.forEach((button) => button.remove());
  if (passButton) {
    passButton.classList.add('pass-btn');
    passButton.textContent = 'PASS TURN ⏭';
    passButton.onclick = () => socket?.emit('f_pass', {});
  }

  const flexPowerDialog = document.getElementById('power-dialog');
  const openFlexPower = () => flexPowerDialog?.showModal();
  document.getElementById('power-help')?.addEventListener('click', openFlexPower);
  document.getElementById('lobby-power-help')?.addEventListener('click', openFlexPower);
  document.getElementById('close-power-help')?.addEventListener('click', () => flexPowerDialog?.close());

  const tutorialDialog = document.createElement('dialog');
  tutorialDialog.className = 'quick-tutorial-dialog';
  tutorialDialog.innerHTML = `
    <div class="mode-kicker">UNO FLEX · QUICK GUIDE</div>
    <h2>Flex in 30 seconds</h2>
    <div class="quick-guide-grid">
      <article><b>⚡ FLEX POWER ON</b><span>Lets you use a card's Flex side. Using a Flex side turns your Flex Power OFF.</span></article>
      <article><b>↻ FLIP SYMBOL</b><span>Toggles your Flex Power. Wild All Flip toggles everybody.</span></article>
      <article><b>🎨 FLEX MATCH</b><span>A Flex side can match with its secondary color when Flex Power is ON.</span></article>
      <article><b>⏭ PASS</b><span>You can pass on your turn even when you have a playable card.</span></article>
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

  const powerDialog = document.getElementById('dbt-power-dialog');
  const powerTargetWrap = document.getElementById('dbt-power-target-wrap');
  const powerTarget = document.getElementById('dbt-power-target');
  const usePowerButton = document.getElementById('dbt-power-use');

  function showPowerCard(kind, usable = false) {
    const def = powerDefs[kind];
    if (!def || !powerDialog) return;
    selectedPower = kind;
    document.getElementById('dbt-power-icon').textContent = def.icon;
    document.getElementById('dbt-power-title').textContent = def.name;
    document.getElementById('dbt-power-desc').textContent = def.desc;
    const needsTarget = targetPowers.has(kind);
    powerTargetWrap.hidden = !needsTarget;
    if (needsTarget && latestState) {
      const meToken = latestState.players.find((p) => p.name === document.getElementById('me-name')?.textContent?.replace(/^\S+\s+/,'') )?.token;
      const opponents = latestState.players.filter((p) => p.token !== meToken && (p.connected || p.isBot));
      powerTarget.innerHTML = '<option value="">Choose opponent…</option>' + opponents.map((p) => `<option value="${p.token}">${escapeHtml(p.name)}</option>`).join('');
    }
    usePowerButton.hidden = !usable;
    usePowerButton.disabled = !usable;
    usePowerButton.textContent = usable ? `USE ${def.name}` : 'NOT AVAILABLE';
    powerDialog.showModal();
  }

  document.getElementById('dbt-power-close')?.addEventListener('click', () => powerDialog?.close());
  usePowerButton?.addEventListener('click', () => {
    if (!selectedPower || !latestState) return;
    const payload = { power: selectedPower };
    if (targetPowers.has(selectedPower)) {
      const targetToken = powerTarget.value;
      if (!targetToken) return toast('Choose an opponent first');
      payload.targetToken = targetToken;
    }
    socket?.emit('f_power_use', payload);
    powerDialog?.close();
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function renderLobbyPowers(state) {
    const selected = new Set(state.enabledPowers || []);
    document.querySelectorAll('[data-power-toggle]').forEach((button) => {
      const kind = button.dataset.powerToggle;
      button.classList.toggle('selected', selected.has(kind));
      button.disabled = !state.isHost;
      button.title = state.isHost ? 'Click to enable or disable for this room' : 'Only the room host can change Power Cards';
    });
    const hostNote = document.getElementById('power-host-note');
    if (hostNote) hostNote.textContent = state.isHost ? 'You are host · tap cards to toggle' : 'Host controls this pack';
    const summary = document.getElementById('selected-power-summary');
    if (summary) summary.innerHTML = selected.size
      ? 'Selected for everyone: ' + [...selected].map((kind) => `${powerDefs[kind].icon} <b>${powerDefs[kind].name}</b>`).join(' · ')
      : 'Selected for everyone: <b>No extra DBT Power Cards</b>';
  }

  document.querySelectorAll('[data-power-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!latestState?.isHost) return toast('Only the room host can choose Power Cards');
      const kind = button.dataset.powerToggle;
      const next = new Set(latestState.enabledPowers || []);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      socket?.emit('f_set_powers', { powers: allPowerKinds.filter((p) => next.has(p)) });
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showPowerCard(button.dataset.powerToggle, false);
    });
  });

  function renderPowerHand(state) {
    const shelf = document.getElementById('power-hand');
    if (!shelf) return;
    const myPowers = state.myPowers || {};
    const enabled = state.enabledPowers || [];
    const myTurn = state.currentToken && state.players.some((p) => p.token === state.currentToken) && document.getElementById('status')?.textContent?.includes('YOUR TURN');
    shelf.innerHTML = enabled.length ? enabled.map((kind) => {
      const def = powerDefs[kind];
      const count = myPowers[kind] || 0;
      const usable = count > 0 && state.status === 'PLAYING' && !state.pendingDraw4 && !state.pendingRobbery;
      return `<button class="dbt-power-card ${count ? '' : 'spent'}" data-power-card="${kind}" data-usable="${usable ? '1' : '0'}">
        <span class="dbt-power-corner">${count ? `×${count}` : 'USED'}</span><span class="dbt-power-big">${def.icon}</span><b>${def.name}</b><small>${def.desc}</small>
      </button>`;
    }).join('') : '<div class="no-powers">No extra DBT Power Cards were selected for this match.</div>';
    shelf.querySelectorAll('[data-power-card]').forEach((button) => {
      button.addEventListener('click', () => showPowerCard(button.dataset.powerCard, button.dataset.usable === '1'));
    });
    if (state.shieldActive) shelf.insertAdjacentHTML('afterbegin','<div class="shield-live">🛡️ SHIELD ACTIVE · next attack will be blocked</div>');
  }

  function renderRobbery(state) {
    const dialog = document.getElementById('robbery-dialog');
    const choices = document.getElementById('robbery-choices');
    if (!dialog || !choices) return;
    if (!state.pendingRobbery?.mustChoose) {
      if (dialog.open) dialog.close();
      return;
    }
    choices.innerHTML = (state.pendingRobbery.choices || []).map((kind) => `<button type="button" data-robbery-power="${kind}">${powerDefs[kind]?.icon || '⚡'} <b>${powerDefs[kind]?.name || kind}</b></button>`).join('');
    choices.querySelectorAll('[data-robbery-power]').forEach((button) => button.onclick = () => {
      socket?.emit('f_robbery_choose', { power: button.dataset.robberyPower });
    });
    if (!dialog.open) dialog.showModal();
  }

  function renderFreezeTimer(state) {
    const el = document.getElementById('power-timer');
    clearInterval(timerTick);
    if (!el || !state.turnDeadline) { if (el) el.hidden = true; return; }
    el.hidden = false;
    const paint = () => {
      const left = Math.max(0, state.turnDeadline - Date.now());
      el.textContent = `⏱️ ${(left / 1000).toFixed(1)}s`;
      el.classList.toggle('danger-timer', left < 1400);
      if (!left) clearInterval(timerTick);
    };
    paint();
    timerTick = setInterval(paint, 100);
  }

  function showPowerIntro(state) {
    if (powerIntroShown || state.status !== 'PLAYING') return;
    powerIntroShown = true;
    const enabled = state.enabledPowers || [];
    if (!enabled.length) return;
    const intro = document.createElement('dialog');
    intro.className = 'power-intro-dialog';
    intro.innerHTML = `<div class="mode-kicker">NEW FOR THIS MATCH</div><h2>DBT Power Cards</h2><p>These are separate from normal UNO/Flex cards. Tap any Power Card during the game to read what it does before using it.</p><div class="power-intro-grid">${enabled.map((kind) => `<article><span>${powerDefs[kind].icon}</span><b>${powerDefs[kind].name}</b><small>${powerDefs[kind].desc}</small></article>`).join('')}</div><button class="primary wide" type="button">START MATCH ⚡</button>`;
    document.body.appendChild(intro);
    intro.querySelector('button').onclick = () => { intro.close(); intro.remove(); };
    intro.showModal();
  }

  socket?.on('f_state', (state) => {
    latestState = state;
    renderLobbyPowers(state);
    renderPowerHand(state);
    renderRobbery(state);
    renderFreezeTimer(state);
    showPowerIntro(state);
    if (passButton) {
      const canPass = state.status === 'PLAYING' && !state.pendingDraw4 && !state.pendingRobbery && document.getElementById('status')?.textContent?.includes('YOUR TURN');
      passButton.disabled = !canPass;
    }
  });
})();
