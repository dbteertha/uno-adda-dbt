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
  const transition = document.getElementById('uno-transition');
  if (!home || !menu) return;

  const deepMatch = location.pathname.match(/^\/room=([A-Z2-9]{4})\/?$/i);
  const deepRoom = deepMatch?.[1]?.toUpperCase() || null;
  const deepMode = new URLSearchParams(location.search).get('mode') === 'flex' ? 'flex' : 'classic';

  let gameOpened = false;
  let pendingAction = null;
  let bypassClassic = false;
  let pendingDeepJoin = !!deepRoom;
  let transitionBusy = false;

  const notifySafe = (text) => {
    if (typeof notify === 'function') notify(text);
    else alert(text);
  };
  const escapeText = (value) => String(value).replace(/[<>&"']/g, '');

  const gate = document.createElement('dialog');
  gate.id = 'name-gate';
  gate.className = 'name-gate';
  gate.innerHTML = `
    <div class="mode-kicker">UNO ADDA · PLAYER ENTRY</div>
    <h2>${deepRoom ? 'Join room ' + deepRoom : 'Enter UNO Adda'}</h2>
    <p>Your name is what other players will see in live rooms and on the board.</p>
    <input id="gate-name" maxlength="24" autocomplete="nickname" placeholder="Your name" />
    <button id="gate-continue" type="button">CONTINUE TO UNO ADDA →</button>
    <small>No Google sign-in. Name only.</small>`;
  document.body.appendChild(gate);
  const gateInput = document.getElementById('gate-name');
  const savedName = localStorage.getItem('dbt-player-name') || '';
  if (gateInput) gateInput.value = savedName;
  if (nameInput) nameInput.value = savedName;

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

  const selectedAvatar = () => {
    const active = document.querySelector('#avatars .avatar.active');
    return active?.dataset?.avatar || localStorage.getItem('uno-avatar') || '⚽';
  };
  const playerName = () => (nameInput?.value || localStorage.getItem('dbt-player-name') || '').trim();
  const roomCode = () => (codeInput?.value || '').trim().toUpperCase();

  document.querySelectorAll('#avatars .avatar').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('#avatars .avatar').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      localStorage.setItem('uno-avatar', button.dataset.avatar || '⚽');
    });
  });

  const activateHome = () => {
    gameOpened = false;
    home.hidden = false;
    menu.hidden = true;
    if (lobby) lobby.hidden = true;
    if (board) board.hidden = true;
    document.body.classList.add('launcher-active');
  };

  const playEntrySound = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.72);
      gain.connect(ctx.destination);
      [110, 164, 246, 369].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.075);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + 0.45 + i * 0.05);
        osc.connect(gain);
        osc.start(ctx.currentTime + i * 0.075);
        osc.stop(ctx.currentTime + 0.75);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1100);
    } catch {}
  };

  const showTransition = (done) => {
    if (!transition || transitionBusy) return done();
    transitionBusy = true;
    transition.hidden = false;
    transition.classList.remove('out');
    transition.classList.add('in');
    playEntrySound();
    setTimeout(() => {
      done();
      transition.classList.add('out');
      setTimeout(() => {
        transition.hidden = true;
        transition.classList.remove('in', 'out');
        transitionBusy = false;
      }, 420);
    }, 780);
  };

  const activateUno = () => {
    const currentName = localStorage.getItem('dbt-player-name') || '';
    if (gateInput) gateInput.value = currentName;
    showTransition(() => {
      gate.showModal();
      setTimeout(() => gateInput?.focus(), 40);
    });
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
      <button id="choose-classic" class="uno-choice classic-choice" type="button"><span class="choice-icon">🎴</span><span class="choice-text"><b>UNO CLASSIC</b><small>Classic table · Devil · DBT Powers</small></span><span class="choice-arrow">›</span></button>
      <div class="flex-choice-wrap">
        <button id="choose-flex" class="uno-choice flex-choice" type="button"><span class="choice-icon">⚡</span><span class="choice-text"><b>UNO FLEX</b><small>Official Flex-style power sides</small></span><span class="choice-arrow">›</span></button>
        <button id="open-flex-tutorial" class="tutorial-icon-btn" type="button" aria-label="UNO Flex tutorial" title="UNO Flex tutorial">?</button>
      </div>
    </div>
    <div class="mode-foot">Classic and Flex use different tables and card designs.</div>`;
  document.body.appendChild(picker);

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

  const joinLiveRoom = (roomCodeValue) => {
    if (!playerName()) return activateUno();
    if (codeInput) codeInput.value = roomCodeValue;
    pendingAction = 'join';
    runClassic();
  };

  const renderPresence = ({ users = [], count = 0, rooms = [] } = {}) => {
    const countEl = document.getElementById('real-online-count');
    if (countEl) countEl.textContent = String(count);

    const suggested = document.getElementById('suggested-user-list');
    if (suggested) suggested.innerHTML = users.length
      ? users.slice(0, 16).map((u) => `<span class="active-user-chip"><i></i>${escapeText(u.name)}</span>`).join('')
      : '<span class="active-empty">No other named players online yet.</span>';

    const roomList = document.getElementById('room-browser-list');
    if (!roomList) return;
    const joinableRooms = rooms.filter((r) => r.joinable);
    roomList.innerHTML = joinableRooms.length ? joinableRooms.map((room) => `
      <article class="room-card">
        <div class="room-card-main"><div><small>ROOM</small><b>${escapeText(room.roomCode)}</b></div><span>${room.players.length}/4</span></div>
        <div class="room-player-row">${room.players.map((p) => `<span title="${escapeText(p.name)}">${escapeText(p.avatar)} ${escapeText(p.name)}${p.isBot ? ' · BOT' : ''}</span>`).join('')}</div>
        <button class="room-join-btn" type="button" data-room-code="${escapeText(room.roomCode)}">JOIN →</button>
      </article>`).join('') : '<div class="room-empty">No open rooms yet. Create the first one 🔥</div>';
    roomList.querySelectorAll('[data-room-code]').forEach((button) => button.addEventListener('click', () => joinLiveRoom(button.dataset.roomCode)));
  };

  let hype = 23232 + Math.floor(Math.random() * (34343 - 23232));
  setInterval(() => {
    hype += Math.floor(Math.random() * 601) - 300;
    hype = Math.max(23232, Math.min(34343, hype));
    const el = document.getElementById('simulated-hype-count');
    if (el) el.textContent = hype.toLocaleString();
  }, 1800);

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
    socket.on('s_presence', renderPresence);
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