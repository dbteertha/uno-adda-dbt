(() => {
  const premiumCss = document.createElement('link');
  premiumCss.rel = 'stylesheet';
  premiumCss.href = '/premium.css';
  document.head.appendChild(premiumCss);

  const home = document.getElementById('home');
  const menu = document.getElementById('menu');
  const lobby = document.getElementById('lobby');
  const board = document.getElementById('board');
  const play = document.getElementById('home-play-uno');
  const unoTile = document.querySelector('.game-tile[data-game="uno"]');
  const homeButton = document.getElementById('home-button');
  const createForm = document.getElementById('create');
  const joinForm = document.getElementById('join');
  const botButton = document.getElementById('bot-play');
  const nameInput = document.getElementById('name');
  const codeInput = document.getElementById('code');
  if (!home || !menu) return;

  const deepMatch = location.pathname.match(/^\/room=([A-Z2-9]{4})\/?$/i);
  const deepRoom = deepMatch?.[1]?.toUpperCase() || null;
  const deepMode = new URLSearchParams(location.search).get('mode') === 'flex' ? 'flex' : 'classic';

  let gameOpened = false;
  let pendingAction = null;
  let bypassClassic = false;
  let pendingDeepJoin = !!deepRoom;

  const notifySafe = (text) => {
    if (typeof notify === 'function') notify(text);
    else alert(text);
  };

  const escapeText = (value) => String(value).replace(/[<>&"']/g, '');

  const activePanel = document.createElement('section');
  activePanel.className = 'active-users-panel';
  activePanel.innerHTML = `
    <div class="active-users-head">
      <div><span class="presence-dot"></span><b>ACTIVE IN UNO ADDA</b></div>
      <strong id="active-user-count">0 online</strong>
    </div>
    <div id="active-user-list" class="active-user-list"><span class="active-empty">Players who enter UNO Adda will appear here.</span></div>`;
  menu.querySelector('p')?.insertAdjacentElement('afterend', activePanel);

  const gate = document.createElement('dialog');
  gate.id = 'name-gate';
  gate.className = 'name-gate';
  gate.innerHTML = `
    <div class="mode-kicker">UNO ADDA · PLAYER ENTRY</div>
    <h2>${deepRoom ? 'Join room ' + deepRoom : 'Enter UNO Adda'}</h2>
    <p>Your name is what other players will see in the waiting room and on the board.</p>
    <input id="gate-name" maxlength="24" autocomplete="nickname" placeholder="Your name" />
    <button id="gate-continue" type="button">CONTINUE TO UNO ADDA →</button>
    <small>No Google sign-in. Name only.</small>`;
  document.body.appendChild(gate);
  const gateInput = document.getElementById('gate-name');
  const savedName = localStorage.getItem('dbt-player-name') || '';
  if (gateInput) gateInput.value = savedName;
  if (nameInput && savedName) nameInput.value = savedName;

  const emitPresence = () => {
    const displayName = (nameInput?.value || localStorage.getItem('dbt-player-name') || '').trim();
    if (!displayName) return;
    try { if (socket.connected) socket.emit('c_presence_set', { displayName }); } catch {}
  };

  const setPlayerName = (value) => {
    const displayName = value.trim().slice(0, 24);
    if (!displayName) return false;
    localStorage.setItem('dbt-player-name', displayName);
    if (nameInput) nameInput.value = displayName;
    emitPresence();
    return true;
  };

  const activateHome = () => {
    gameOpened = false;
    home.hidden = false;
    menu.hidden = true;
    if (lobby) lobby.hidden = true;
    if (board) board.hidden = true;
    document.body.classList.add('launcher-active');
  };

  const activateUno = () => {
    const currentName = localStorage.getItem('dbt-player-name') || '';
    if (gateInput) gateInput.value = currentName;
    gate.showModal();
    setTimeout(() => gateInput?.focus(), 40);
  };

  const enterUnoMenu = () => {
    gameOpened = true;
    home.hidden = true;
    document.body.classList.remove('launcher-active');
    menu.hidden = false;
    emitPresence();
  };

  document.getElementById('gate-continue')?.addEventListener('click', () => {
    if (!setPlayerName(gateInput?.value || '')) return notifySafe('Enter your name first 😄');
    gate.close();
    enterUnoMenu();
    if (pendingDeepJoin && deepRoom) {
      pendingDeepJoin = false;
      if (codeInput) codeInput.value = deepRoom;
      if (deepMode === 'flex') {
        const params = new URLSearchParams({ entry: 'join', roomCode: deepRoom, name: nameInput?.value || 'DBT Player', avatar: selectedAvatar(), tutorial: 'before' });
        location.href = `/flex/?${params.toString()}`;
      } else {
        pendingAction = 'join';
        runClassic();
      }
    }
  });
  gateInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('gate-continue')?.click(); });

  const picker = document.createElement('dialog');
  picker.id = 'uno-mode-picker';
  picker.className = 'mode-picker';
  picker.innerHTML = `
    <button id="uno-mode-close" class="mode-close" type="button" aria-label="Close">×</button>
    <div class="mode-kicker">UNO ADDA · MATCH RULES</div>
    <h2>Choose your UNO</h2>
    <p id="uno-mode-copy">Choose the ruleset for this match.</p>
    <div class="uno-choice-grid">
      <button id="choose-classic" class="uno-choice classic-choice" type="button">
        <span class="choice-icon">🎴</span><span class="choice-text"><b>UNO CLASSIC</b><small>Classic table · Devil Card</small></span><span class="choice-arrow">›</span>
      </button>
      <div class="flex-choice-wrap">
        <button id="choose-flex" class="uno-choice flex-choice" type="button">
          <span class="choice-icon">⚡</span><span class="choice-text"><b>UNO FLEX</b><small>Power Cards · Flex sides</small></span><span class="choice-arrow">›</span>
        </button>
        <button id="open-flex-tutorial" class="tutorial-icon-btn" type="button" aria-label="UNO Flex tutorial" title="UNO Flex tutorial">?</button>
      </div>
    </div>
    <div class="mode-foot">Classic and Flex use different tables and card designs.</div>`;
  document.body.appendChild(picker);

  const selectedAvatar = () => document.querySelector('#avatars .avatar.active')?.textContent?.trim() || localStorage.getItem('uno-avatar') || '😎';
  const playerName = () => (nameInput?.value || localStorage.getItem('dbt-player-name') || '').trim();
  const roomCode = () => (codeInput?.value || '').trim().toUpperCase();

  const openModePicker = (action) => {
    if (!playerName()) return activateUno();
    pendingAction = action;
    const copy = document.getElementById('uno-mode-copy');
    if (copy) copy.textContent = action === 'bot' ? 'Bot Mode — choose Classic or Flex.' : action === 'join' ? 'Choose the same ruleset as the room host.' : 'Create the room as Classic or Flex.';
    picker.showModal();
  };

  function runClassic() {
    const action = pendingAction;
    pendingAction = null;
    if (picker.open) picker.close();
    emitPresence();
    bypassClassic = true;
    try {
      if (action === 'bot') botButton?.click();
      else if (action === 'join') joinForm?.requestSubmit();
      else createForm?.requestSubmit();
    } finally { setTimeout(() => { bypassClassic = false; }, 0); }
  }

  const flexUrl = (tutorialOnly = false) => {
    const action = pendingAction || 'create';
    const params = new URLSearchParams({ entry: action, name: playerName() || 'DBT Player', avatar: selectedAvatar(), tutorial: tutorialOnly ? 'only' : 'before' });
    if (action === 'join') {
      const code = roomCode();
      if (code.length !== 4 && !tutorialOnly) return null;
      if (code.length === 4) params.set('roomCode', code);
    }
    return `/flex/?${params.toString()}`;
  };

  const runFlex = () => {
    const url = flexUrl(false);
    if (!url) return notifySafe('Enter the 4-character room code 😄');
    pendingAction = null;
    picker.close();
    emitPresence();
    location.href = url;
  };

  const ensureClassicShare = (roomCodeValue) => {
    if (!lobby || !roomCodeValue) return;
    const url = `${location.origin}/room=${roomCodeValue}?mode=classic`;
    let box = document.getElementById('classic-share-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'classic-share-box';
      box.className = 'classic-share-box';
      lobby.querySelector('#share')?.insertAdjacentElement('afterend', box);
    }
    box.innerHTML = `<b>🔗 INSTANT JOIN LINK</b><small>Send this link. Your friend enters a name, then joins this room.</small><div class="classic-share-row"><input id="classic-share-url" readonly value="${url}"><button id="copy-classic-link" type="button">COPY LINK</button></div>`;
    document.getElementById('copy-classic-link')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); notifySafe('Room link copied ✅'); } catch { notifySafe(url); }
    });
    history.replaceState({}, '', `/room=${roomCodeValue}?mode=classic`);
  };

  play?.addEventListener('click', activateUno);
  unoTile?.addEventListener('click', activateUno);
  activateHome();

  createForm?.addEventListener('submit', (e) => {
    if (bypassClassic) return;
    e.preventDefault(); e.stopImmediatePropagation(); openModePicker('create');
  }, true);
  joinForm?.addEventListener('submit', (e) => {
    if (bypassClassic) return;
    e.preventDefault(); e.stopImmediatePropagation(); if (roomCode().length === 4) openModePicker('join');
  }, true);
  botButton?.addEventListener('click', (e) => {
    if (bypassClassic) return;
    e.preventDefault(); e.stopImmediatePropagation(); openModePicker('bot');
  }, true);

  document.getElementById('uno-mode-close')?.addEventListener('click', () => picker.close());
  document.getElementById('choose-classic')?.addEventListener('click', runClassic);
  document.getElementById('choose-flex')?.addEventListener('click', runFlex);
  document.getElementById('open-flex-tutorial')?.addEventListener('click', () => { const url = flexUrl(true); if (url) location.href = url; });

  homeButton?.addEventListener('click', () => {
    try { if (typeof state !== 'undefined' && state) { notifySafe('খেলা চলছে বস—রুম ছাড়লে হোমে যেতে পারবে 😄'); return; } } catch {}
    history.replaceState({}, '', '/');
    activateHome();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.querySelectorAll('.game-tile.soon').forEach((button) => button.addEventListener('click', () => notifySafe(`${button.querySelector('span:last-child')?.textContent || 'এই গেম'} — coming soon by DBT 🚧🔥`)));
  document.querySelectorAll('.launcher-tab').forEach((button) => { if (!button.classList.contains('active')) button.addEventListener('click', () => notifySafe('DBT Media — coming soon 🎬🔥')); });

  try {
    socket.on('connect', () => { emitPresence(); if (!gameOpened && !state && !deepRoom) activateHome(); });
    socket.on('s_presence', ({ users = [], count = 0 } = {}) => {
      const countEl = document.getElementById('active-user-count');
      const listEl = document.getElementById('active-user-list');
      if (countEl) countEl.textContent = `${count} online`;
      if (listEl) listEl.innerHTML = users.length ? users.slice(0, 12).map((u) => `<span class="active-user-chip"><i></i>${escapeText(u.name)}</span>`).join('') : '<span class="active-empty">No named players online yet.</span>';
    });
    socket.on('s_sync_state', (s) => {
      gameOpened = true; home.hidden = true; document.body.classList.remove('launcher-active');
      if (s?.roomCode) ensureClassicShare(s.roomCode);
    });
    socket.on('s_room_created', ({ roomCode: createdCode } = {}) => {
      gameOpened = true; home.hidden = true; document.body.classList.remove('launcher-active');
      if (createdCode) ensureClassicShare(createdCode);
    });
  } catch {}

  if (deepRoom) {
    activateHome();
    setTimeout(activateUno, 80);
  }
})();