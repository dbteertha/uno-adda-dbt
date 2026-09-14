(() => {
  const socket = window.DBT_CLASSIC_SOCKET;
  if (!socket) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/classic-enhancements.css';
  document.head.appendChild(css);

  let meta = null;
  let lastState = null;
  let selectedPower = null;

  const POWER_INFO = {
    MAGNET: { icon:'🧲', name:'MAGNET', desc:"Pull 1 random UNO card from a selected opponent's hand. It cannot steal their final card. SHIELD blocks it." },
    SHIELD: { icon:'🛡️', name:'SHIELD', desc:'Activate on your turn. It stays active until it blocks the next MAGNET, ROBBERY or TIME FREEZE used against you.' },
    TIME_FREEZE: { icon:'⏱️', name:'TIME FREEZE', desc:'Arm the next actual player turn with only 3 seconds. If time expires, the server moves the turn on. SHIELD blocks the freeze.' },
    ROBBERY: { icon:'🥷', name:'ROBBERY', desc:'Choose an opponent. A human opponent chooses which remaining DBT Power Card to surrender; bots choose automatically. SHIELD blocks it.' },
  };

  const toast = (msg) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 3200);
  };

  const lobby = document.getElementById('lobby');
  const ready = document.getElementById('ready');
  const panel = document.createElement('section');
  panel.id = 'classic-rules-panel';
  panel.className = 'classic-rules-panel';
  panel.innerHTML = `
    <div class="rules-head">
      <div><small>UNO CLASSIC · MATCH LOADOUT</small><h3>Choose this room's cards</h3></div>
      <span id="rules-role">VISIBLE TO EVERYONE</span>
    </div>
    <div class="special-toggle-grid">
      <button data-special="wild" class="special-toggle" type="button"><span>🌈</span><b>4 COLOR / WILD</b><small>4 color-change Wild cards</small><em>ON</em></button>
      <button data-special="drawFour" class="special-toggle" type="button"><span>+4</span><b>WILD DRAW FOUR</b><small>4 Wild +4 cards</small><em>ON</em></button>
      <button data-special="devil" class="special-toggle" type="button"><span>😈</span><b>DEVIL</b><small>2 one-second reveal cards</small><em>ON</em></button>
    </div>
    <div class="rules-subhead"><b>DBT POWER CARDS</b><small>Host chooses the loadout. Every player sees the same selection.</small></div>
    <div id="classic-power-select" class="classic-power-select"></div>`;
  if (lobby && ready) lobby.insertBefore(panel, ready);

  const powerDock = document.createElement('section');
  powerDock.id = 'classic-power-dock';
  powerDock.className = 'classic-power-dock';
  powerDock.innerHTML = `
    <div class="power-dock-head">
      <div><small>DBT POWER LOADOUT</small><b>Your tactical cards</b></div>
      <span id="classic-shield-state"></span>
    </div>
    <div id="classic-power-status" class="classic-power-status">Power system online.</div>
    <div id="classic-power-hand" class="classic-power-hand"></div>`;
  const board = document.getElementById('board');
  const partyDock = board?.querySelector('.party-dock');
  if (board && partyDock) board.insertBefore(powerDock, partyDock);

  const dialog = document.createElement('dialog');
  dialog.className = 'classic-power-dialog';
  dialog.innerHTML = `
    <div class="power-dialog-icon" id="classic-power-icon"></div>
    <small>DBT POWER CARD</small>
    <h2 id="classic-power-title"></h2>
    <p id="classic-power-desc"></p>
    <select id="classic-power-target" hidden></select>
    <div id="classic-power-lock" class="power-lock"></div>
    <button id="classic-power-use" class="primary big" type="button">USE POWER</button>
    <button id="classic-power-close" class="quiet" type="button">CANCEL</button>`;
  document.body.appendChild(dialog);

  const robberyDialog = document.createElement('dialog');
  robberyDialog.className = 'classic-power-dialog robbery-dialog';
  robberyDialog.innerHTML = `
    <div class="power-dialog-icon">🥷</div>
    <small>ROBBERY INCOMING</small>
    <h2>You choose what they steal</h2>
    <p>An opponent used ROBBERY on you. Tap one of your remaining Power Cards to surrender it.</p>
    <div id="robbery-choices" class="robbery-choices"></div>`;
  document.body.appendChild(robberyDialog);

  function sendConfig() {
    if (!meta?.isHost) return;
    const specials = {};
    document.querySelectorAll('[data-special]').forEach((b) => { specials[b.dataset.special] = b.classList.contains('selected'); });
    const powers = [...document.querySelectorAll('#classic-power-select [data-power].selected')].map((b) => b.dataset.power);
    socket.emit('c_classic_config', { ...specials, powers });
  }

  function renderLobbyMeta() {
    if (!meta || !panel) return;
    panel.hidden = lastState?.status !== 'LOBBY';
    if (panel.hidden) return;
    const role = document.getElementById('rules-role');
    if (role) role.textContent = meta.isHost ? 'HOST CONTROLS' : 'HOST SELECTION · VIEW ONLY';
    for (const key of ['wild','drawFour','devil']) {
      const b = panel.querySelector(`[data-special="${key}"]`);
      if (!b) continue;
      const selected = !!meta.specialCards?.[key];
      b.classList.toggle('selected', selected);
      b.disabled = !meta.isHost;
      const tag = b.querySelector('em');
      if (tag) tag.textContent = selected ? 'ON' : 'OFF';
    }
    const wrap = document.getElementById('classic-power-select');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const [kind, info] of Object.entries(POWER_INFO)) {
      const selected = meta.enabledPowers?.includes(kind);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.power = kind;
      b.className = 'power-select-card' + (selected ? ' selected' : '');
      b.disabled = !meta.isHost;
      b.innerHTML = `<span>${info.icon}</span><b>${info.name}</b><small>${info.desc}</small><em>${selected ? 'ON' : 'OFF'}</em>`;
      b.onclick = () => { if (!meta.isHost) return; b.classList.toggle('selected'); sendConfig(); };
      wrap.appendChild(b);
    }
  }

  panel?.querySelectorAll('[data-special]').forEach((b) => b.addEventListener('click', () => {
    if (!meta?.isHost) return;
    b.classList.toggle('selected');
    sendConfig();
  }));

  function canUsePower(kind) {
    if (!meta || !lastState || lastState.status !== 'PLAYING') return false;
    if (!meta.isMyTurn || lastState.paused || lastState.needsStartingColor || meta.pendingRobbery) return false;
    if ((meta.myPowers?.[kind] || 0) <= 0) return false;
    if (kind === 'SHIELD' && meta.shieldActive) return false;
    if (kind === 'TIME_FREEZE' && meta.freezeArmed) return false;
    return true;
  }

  function renderPowerDock() {
    if (!meta || !powerDock) return;
    const playing = lastState?.status === 'PLAYING';
    powerDock.hidden = !playing;
    if (!playing) return;
    const hand = document.getElementById('classic-power-hand');
    if (!hand) return;
    hand.innerHTML = '';
    for (const kind of meta.enabledPowers || []) {
      const info = POWER_INFO[kind];
      const count = meta.myPowers?.[kind] || 0;
      const availableNow = canUsePower(kind);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `classic-power-card ${count ? '' : 'spent'} ${availableNow ? 'armed' : 'locked'}`;
      b.innerHTML = `<span>${info.icon}</span><b>${info.name}</b><small>${count ? info.desc : 'This power has been used.'}</small><em>${count ? (availableNow ? 'READY · TAP' : 'TAP TO READ') : 'SPENT'}</em>`;
      b.onclick = () => openPower(kind);
      hand.appendChild(b);
    }
    const shield = document.getElementById('classic-shield-state');
    if (shield) shield.textContent = meta.shieldActive ? '🛡️ SHIELD ACTIVE' : (meta.freezeArmed ? '⏱️ FREEZE ARMED' : '⚡ POWER READY');
    const status = document.getElementById('classic-power-status');
    if (status) status.textContent = meta.lastPowerAction || 'Power system online.';
  }

  function openPower(kind) {
    const info = POWER_INFO[kind];
    if (!info) return;
    selectedPower = kind;
    document.getElementById('classic-power-icon').textContent = info.icon;
    document.getElementById('classic-power-title').textContent = info.name;
    document.getElementById('classic-power-desc').textContent = info.desc;
    const target = document.getElementById('classic-power-target');
    const needsTarget = ['MAGNET','ROBBERY'].includes(kind);
    target.hidden = !needsTarget;
    if (needsTarget) {
      const opponents = (meta?.players || []).filter((p) => p.token !== meta?.meToken && (p.connected || p.isBot));
      target.innerHTML = `<option value="">Choose opponent…</option>` + opponents.map((p) => `<option value="${p.token}">${p.avatar} ${p.name}${p.shieldActive ? ' · 🛡️' : ''}</option>`).join('');
    }
    const usable = canUsePower(kind);
    const lock = document.getElementById('classic-power-lock');
    if (lock) {
      lock.textContent = usable ? 'READY ON YOUR TURN' : (meta?.myPowers?.[kind] ? 'You can read this now; use it only on your active turn.' : 'This power has already been spent.');
      lock.classList.toggle('ready', usable);
    }
    const use = document.getElementById('classic-power-use');
    use.disabled = !usable;
    use.textContent = usable ? `USE ${info.name}` : 'POWER LOCKED';
    dialog.showModal();
  }

  document.getElementById('classic-power-close').onclick = () => dialog.close();
  document.getElementById('classic-power-use').onclick = () => {
    if (!selectedPower || !canUsePower(selectedPower)) return;
    const target = document.getElementById('classic-power-target');
    const targetToken = target.hidden ? undefined : target.value || undefined;
    if (!target.hidden && !targetToken) return toast('Choose an opponent first');
    socket.emit('c_power_use', { power: selectedPower, targetToken });
    dialog.close();
  };

  function renderRobbery() {
    const pending = meta?.pendingRobbery;
    if (!pending?.mustChoose) {
      if (robberyDialog.open) robberyDialog.close();
      return;
    }
    const box = document.getElementById('robbery-choices');
    box.innerHTML = '';
    for (const kind of pending.choices || []) {
      const info = POWER_INFO[kind];
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${info.icon}</span><b>${info.name}</b><small>Give this power away</small>`;
      b.onclick = () => { socket.emit('c_robbery_choose', { power: kind }); robberyDialog.close(); };
      box.appendChild(b);
    }
    if (!box.children.length) box.innerHTML = '<p>No Power Cards left to surrender.</p>';
    if (!robberyDialog.open) robberyDialog.showModal();
  }

  function enforcePassButton() {
    const pass = document.getElementById('pass');
    if (!pass || !lastState) return;
    const hasApplicableCard = Array.isArray(lastState.playableCardIds) && lastState.playableCardIds.length > 0;
    const canPass = lastState.status === 'PLAYING' && lastState.isMyTurn && !lastState.paused && !lastState.needsStartingColor && !meta?.pendingRobbery && hasApplicableCard;
    pass.hidden = !canPass;
    pass.disabled = !canPass;
    pass.textContent = 'PASS TURN ⏭';
    pass.title = 'Available only when you have an applicable color / number / action card';
  }

  socket.on('s_sync_state', (s) => {
    lastState = s;
    queueMicrotask(() => { renderLobbyMeta(); renderPowerDock(); renderRobbery(); enforcePassButton(); });
  });
  socket.on('s_classic_meta', (m) => {
    meta = m;
    renderLobbyMeta();
    renderPowerDock();
    renderRobbery();
    enforcePassButton();
  });
  socket.on('s_power_notice', ({ message }) => toast(message));
})();
