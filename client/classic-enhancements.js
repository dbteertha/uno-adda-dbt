(() => {
  const socket = window.DBT_CLASSIC_SOCKET;
  if (!socket) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/classic-enhancements.css';
  document.head.appendChild(css);

  let meta = null;
  let lastState = null;

  const POWER_INFO = {
    MAGNET: { icon:'🧲', name:'MAGNET', desc:"Pull 1 random card from an opponent's hand." },
    SHIELD: { icon:'🛡️', name:'SHIELD', desc:'Block the next DBT Power Card used against you.' },
    TIME_FREEZE: { icon:'⏱️', name:'TIME FREEZE', desc:'The next player gets only 3 seconds to play. If time ends, their turn auto-passes.' },
    ROBBERY: { icon:'🥷', name:'ROBBERY', desc:'Choose an opponent. That opponent chooses one of their remaining Power Cards to give you.' },
  };

  const toast = (msg) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 2800);
  };

  const lobby = document.getElementById('lobby');
  const ready = document.getElementById('ready');
  const panel = document.createElement('section');
  panel.id = 'classic-rules-panel';
  panel.className = 'classic-rules-panel';
  panel.innerHTML = `
    <div class="rules-head"><div><small>UNO CLASSIC · ROOM RULES</small><h3>Choose the cards for this match</h3></div><span id="rules-role">VISIBLE TO EVERYONE</span></div>
    <div class="special-toggle-grid">
      <button data-special="wild" class="special-toggle"><span>🌈</span><b>4 COLOR / WILD</b><small>4 Wild color-change cards</small></button>
      <button data-special="drawFour" class="special-toggle"><span>+4</span><b>WILD DRAW FOUR</b><small>4 +4 cards</small></button>
      <button data-special="devil" class="special-toggle"><span>😈</span><b>DEVIL</b><small>2 Devil reveal cards</small></button>
    </div>
    <div class="rules-subhead"><b>DBT POWER CARDS</b><small>Host selects them. Every player can see the selection.</small></div>
    <div id="classic-power-select" class="classic-power-select"></div>`;
  if (lobby && ready) lobby.insertBefore(panel, ready);

  const powerDock = document.createElement('section');
  powerDock.id = 'classic-power-dock';
  powerDock.className = 'classic-power-dock';
  powerDock.innerHTML = `<div class="power-dock-head"><div><small>DBT POWER CARDS</small><b>Your powers</b></div><span id="classic-shield-state"></span></div><div id="classic-power-hand" class="classic-power-hand"></div>`;
  const board = document.getElementById('board');
  const partyDock = board?.querySelector('.party-dock');
  if (board && partyDock) board.insertBefore(powerDock, partyDock);

  const dialog = document.createElement('dialog');
  dialog.className = 'classic-power-dialog';
  dialog.innerHTML = `<div class="power-dialog-icon" id="classic-power-icon"></div><small>DBT POWER CARD</small><h2 id="classic-power-title"></h2><p id="classic-power-desc"></p><select id="classic-power-target" hidden></select><button id="classic-power-use" class="primary big" type="button">USE POWER</button><button id="classic-power-close" class="quiet" type="button">CANCEL</button>`;
  document.body.appendChild(dialog);

  const robberyDialog = document.createElement('dialog');
  robberyDialog.className = 'classic-power-dialog robbery-dialog';
  robberyDialog.innerHTML = `<div class="power-dialog-icon">🥷</div><small>ROBBERY</small><h2>Choose what you give away</h2><p>An opponent used ROBBERY on you. You decide which one of your remaining Power Cards they receive.</p><div id="robbery-choices" class="robbery-choices"></div>`;
  document.body.appendChild(robberyDialog);

  let selectedPower = null;

  function sendConfig() {
    if (!meta?.isHost) return;
    const specials = {};
    document.querySelectorAll('[data-special]').forEach((b) => specials[b.dataset.special] = b.classList.contains('selected'));
    const powers = [...document.querySelectorAll('#classic-power-select [data-power].selected')].map((b) => b.dataset.power);
    socket.emit('c_classic_config', { ...specials, powers });
  }

  function renderLobbyMeta() {
    if (!meta || !panel) return;
    panel.hidden = lastState?.status !== 'LOBBY';
    if (panel.hidden) return;
    document.getElementById('rules-role').textContent = meta.isHost ? 'HOST CONTROLS' : 'HOST SELECTION';
    for (const key of ['wild','drawFour','devil']) {
      const b = panel.querySelector(`[data-special="${key}"]`);
      if (!b) continue;
      b.classList.toggle('selected', !!meta.specialCards?.[key]);
      b.disabled = !meta.isHost;
    }
    const wrap = document.getElementById('classic-power-select');
    wrap.innerHTML = '';
    for (const [kind, info] of Object.entries(POWER_INFO)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.power = kind;
      b.className = 'power-select-card' + (meta.enabledPowers?.includes(kind) ? ' selected' : '');
      b.disabled = !meta.isHost;
      b.innerHTML = `<span>${info.icon}</span><b>${info.name}</b><small>${info.desc}</small><em>${meta.enabledPowers?.includes(kind) ? 'ON' : 'OFF'}</em>`;
      b.onclick = () => { if (!meta.isHost) return; b.classList.toggle('selected'); sendConfig(); };
      wrap.appendChild(b);
    }
  }

  panel?.querySelectorAll('[data-special]').forEach((b) => b.addEventListener('click', () => { if (!meta?.isHost) return; b.classList.toggle('selected'); sendConfig(); }));

  function renderPowerDock() {
    if (!meta || !powerDock) return;
    const playing = lastState?.status === 'PLAYING';
    powerDock.hidden = !playing;
    if (!playing) return;
    const hand = document.getElementById('classic-power-hand');
    hand.innerHTML = '';
    const me = lastState?.players?.find((p) => p.isMe);
    for (const kind of meta.enabledPowers || []) {
      const info = POWER_INFO[kind];
      const count = meta.myPowers?.[kind] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `classic-power-card ${count ? '' : 'spent'}`;
      b.disabled = !count;
      b.innerHTML = `<span>${info.icon}</span><b>${info.name}</b><small>${count ? info.desc : 'USED'}</small><em>${count ? 'TAP TO READ' : 'SPENT'}</em>`;
      b.onclick = () => openPower(kind);
      hand.appendChild(b);
    }
    const shield = document.getElementById('classic-shield-state');
    shield.textContent = meta.shieldActive ? '🛡️ SHIELD ACTIVE' : (me ? `${me.displayName}` : '');
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
      const me = lastState?.players?.find((p) => p.isMe);
      const matchingMetaPlayer = meta.players?.find((p) => p.name === me?.displayName && p.avatar === me?.avatar);
      const opponents = (meta.players || []).filter((p) => p.token !== matchingMetaPlayer?.token);
      target.innerHTML = `<option value="">Choose opponent…</option>` + opponents.map((p) => `<option value="${p.token}">${p.avatar} ${p.name}</option>`).join('');
    }
    dialog.showModal();
  }

  document.getElementById('classic-power-close').onclick = () => dialog.close();
  document.getElementById('classic-power-use').onclick = () => {
    if (!selectedPower) return;
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
      b.innerHTML = `<span>${info.icon}</span><b>${info.name}</b><small>Give this card</small>`;
      b.onclick = () => { socket.emit('c_robbery_choose', { power: kind }); robberyDialog.close(); };
      box.appendChild(b);
    }
    if (!robberyDialog.open) robberyDialog.showModal();
  }

  function enforcePassButton() {
    const pass = document.getElementById('pass');
    if (!pass || !lastState) return;
    const canPass = lastState.status === 'PLAYING' && lastState.isMyTurn && !lastState.paused && !lastState.needsStartingColor;
    pass.hidden = !canPass;
    pass.disabled = !canPass;
    pass.textContent = 'PASS TURN ⏭';
    pass.title = 'Pass even if you have a playable card';
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
