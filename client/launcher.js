(() => {
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
  if (!home || !menu) return;

  let gameOpened = false;
  let pendingAction = null;
  let bypassClassic = false;

  const profileName = localStorage.getItem('dbt-player-name') || '';
  if (nameInput && profileName && !nameInput.value) nameInput.value = profileName;

  const activePanel = document.createElement('section');
  activePanel.className = 'active-users-panel';
  activePanel.innerHTML = `
    <div class="active-users-head">
      <div><span class="presence-dot"></span><b>ACTIVE PLAYERS</b></div>
      <strong id="active-user-count">0 online</strong>
    </div>
    <div id="active-user-list" class="active-user-list"><span class="active-empty">Names will appear here when players enter UNO Adda.</span></div>
  `;
  menu.querySelector('p')?.insertAdjacentElement('afterend', activePanel);

  const profilePanel = document.createElement('section');
  profilePanel.className = 'profile-panel';
  profilePanel.innerHTML = `
    <div class="profile-copy"><b>PLAYER PROFILE</b><small>Name only — no password needed for local play.</small></div>
    <div class="profile-actions">
      <button id="save-player-name" type="button" class="profile-save">Save name</button>
      <button id="google-signin" type="button" class="google-btn" title="Google sign-in requires a Google OAuth Client ID"><span>G</span> Continue with Google</button>
    </div>
  `;
  document.querySelector('.avatar-block')?.insertAdjacentElement('beforebegin', profilePanel);

  const notifySafe = (text) => {
    if (typeof notify === 'function') notify(text);
    else alert(text);
  };

  const emitPresence = () => {
    const displayName = (nameInput?.value || '').trim();
    if (!displayName) return;
    localStorage.setItem('dbt-player-name', displayName);
    try {
      if (socket.connected) socket.emit('c_presence_set', { displayName });
    } catch {}
  };

  document.getElementById('save-player-name')?.addEventListener('click', () => {
    if (!(nameInput?.value || '').trim()) return notifySafe('আগে তোমার নাম লিখো 😄');
    emitPresence();
    notifySafe('নাম সেভ হয়েছে ✅');
  });

  document.getElementById('google-signin')?.addEventListener('click', () => {
    notifySafe('Google sign-in চালু করতে Google OAuth Client ID লাগবে। Client ID দিলে আমি এটাকে real Google sign-in করে দেব।');
  });

  nameInput?.addEventListener('change', emitPresence);
  nameInput?.addEventListener('blur', emitPresence);

  const activateHome = () => {
    gameOpened = false;
    home.hidden = false;
    menu.hidden = true;
    if (lobby) lobby.hidden = true;
    if (board) board.hidden = true;
    document.body.classList.add('launcher-active');
  };

  const activateUno = () => {
    gameOpened = true;
    home.hidden = true;
    document.body.classList.remove('launcher-active');
    menu.hidden = false;
    setTimeout(() => {
      nameInput?.focus();
      emitPresence();
    }, 60);
  };

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
        <span class="choice-icon">🎴</span>
        <span class="choice-text"><b>UNO CLASSIC</b><small>Original DBT UNO Adda</small></span>
        <span class="choice-arrow">›</span>
      </button>
      <div class="flex-choice-wrap">
        <button id="choose-flex" class="uno-choice flex-choice" type="button">
          <span class="choice-icon">⚡</span>
          <span class="choice-text"><b>UNO FLEX</b><small>Power Cards · Flex sides</small></span>
          <span class="choice-arrow">›</span>
        </button>
        <button id="open-flex-tutorial" class="tutorial-icon-btn" type="button" aria-label="UNO Flex tutorial" title="UNO Flex tutorial">?</button>
      </div>
    </div>
    <div class="mode-foot">Flex tutorial appears before the Flex match starts.</div>`;
  document.body.appendChild(picker);

  const selectedAvatar = () => document.querySelector('#avatars .avatar.active')?.textContent?.trim() || localStorage.getItem('uno-avatar') || '😎';
  const playerName = () => (nameInput?.value || '').trim() || 'DBT Player';
  const roomCode = () => (document.getElementById('code')?.value || '').trim().toUpperCase();

  const openModePicker = (action) => {
    pendingAction = action;
    const copy = document.getElementById('uno-mode-copy');
    if (copy) copy.textContent = action === 'bot' ? 'Bot Mode — choose Classic or Flex.' : action === 'join' ? 'Joining a room — choose the same ruleset as the host.' : 'Creating a room — choose Classic or Flex.';
    picker.showModal();
  };

  const runClassic = () => {
    const action = pendingAction;
    pendingAction = null;
    picker.close();
    emitPresence();
    bypassClassic = true;
    try {
      if (action === 'bot') botButton?.click();
      else if (action === 'join') joinForm?.requestSubmit();
      else createForm?.requestSubmit();
    } finally {
      setTimeout(() => { bypassClassic = false; }, 0);
    }
  };

  const flexUrl = (tutorialOnly = false) => {
    const action = pendingAction || 'create';
    const params = new URLSearchParams({
      entry: action,
      name: playerName(),
      avatar: selectedAvatar(),
      tutorial: tutorialOnly ? 'only' : 'before',
    });
    if (action === 'join') {
      const code = roomCode();
      if (code.length !== 4 && !tutorialOnly) return null;
      if (code.length === 4) params.set('roomCode', code);
    }
    return `/flex/?${params.toString()}`;
  };

  const runFlex = () => {
    const url = flexUrl(false);
    if (!url) return notifySafe('৪ অক্ষরের রুম কোড দাও 😄');
    pendingAction = null;
    picker.close();
    emitPresence();
    location.href = url;
  };

  play?.addEventListener('click', activateUno);
  unoTile?.addEventListener('click', activateUno);
  activateHome();

  createForm?.addEventListener('submit', (e) => {
    if (bypassClassic) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openModePicker('create');
  }, true);

  joinForm?.addEventListener('submit', (e) => {
    if (bypassClassic) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (roomCode().length !== 4) return;
    openModePicker('join');
  }, true);

  botButton?.addEventListener('click', (e) => {
    if (bypassClassic) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openModePicker('bot');
  }, true);

  document.getElementById('uno-mode-close')?.addEventListener('click', () => picker.close());
  document.getElementById('choose-classic')?.addEventListener('click', runClassic);
  document.getElementById('choose-flex')?.addEventListener('click', runFlex);
  document.getElementById('open-flex-tutorial')?.addEventListener('click', () => {
    const url = flexUrl(true);
    if (url) location.href = url;
  });

  homeButton?.addEventListener('click', () => {
    try {
      if (typeof state !== 'undefined' && state) {
        if (typeof notify === 'function') notify('খেলা চলছে বস—রুম ছাড়লে হোমে যেতে পারবে 😄');
        return;
      }
    } catch {}
    activateHome();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.querySelectorAll('.game-tile.soon').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.querySelector('span:last-child')?.textContent || 'এই গেম';
      notifySafe(`${name} — coming soon by DBT 🚧🔥`);
    });
  });

  document.querySelectorAll('.launcher-tab').forEach((button) => {
    if (!button.classList.contains('active')) button.addEventListener('click', () => notifySafe('DBT Media — coming soon 🎬🔥'));
  });

  try {
    socket.on('connect', () => {
      emitPresence();
      if (!gameOpened && !state) activateHome();
    });
    socket.on('s_presence', ({ users = [], count = 0 } = {}) => {
      const countEl = document.getElementById('active-user-count');
      const listEl = document.getElementById('active-user-list');
      if (countEl) countEl.textContent = `${count} online`;
      if (listEl) listEl.innerHTML = users.length
        ? users.slice(0, 12).map((u) => `<span class="active-user-chip"><i></i>${String(u.name).replace(/[<>&"']/g,'')}</span>`).join('')
        : '<span class="active-empty">No named players online yet.</span>';
    });
    socket.on('s_sync_state', () => { gameOpened = true; home.hidden = true; document.body.classList.remove('launcher-active'); });
    socket.on('s_room_created', () => { gameOpened = true; home.hidden = true; document.body.classList.remove('launcher-active'); });
  } catch {}
})();