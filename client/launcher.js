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
  if (!home || !menu) return;

  let gameOpened = false;
  let pendingAction = null;
  let bypassClassic = false;

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
    setTimeout(() => document.getElementById('name')?.focus(), 60);
  };

  const picker = document.createElement('dialog');
  picker.id = 'uno-mode-picker';
  picker.className = 'mode-picker';
  picker.innerHTML = `
    <button id="uno-mode-close" class="mode-close" type="button">×</button>
    <div class="mode-kicker">UNO ADDA · CHOOSE MODE</div>
    <h2>Which UNO?</h2>
    <p id="uno-mode-copy">Choose the ruleset for this match.</p>
    <div class="mode-options">
      <button id="choose-classic" class="mode-option" type="button"><span>🎴</span><b>UNO CLASSIC</b><small>Original DBT UNO Adda</small></button>
      <button id="choose-flex" class="mode-option flex-choice" type="button"><span>⚡</span><b>UNO FLEX</b><small>Power Cards · Flex sides · tutorial first</small></button>
    </div>`;
  document.body.appendChild(picker);

  const selectedAvatar = () => document.querySelector('#avatars .avatar.active')?.textContent?.trim() || localStorage.getItem('uno-avatar') || '😎';
  const playerName = () => (document.getElementById('name')?.value || '').trim() || 'DBT Player';
  const roomCode = () => (document.getElementById('code')?.value || '').trim().toUpperCase();

  const openModePicker = (action) => {
    pendingAction = action;
    const copy = document.getElementById('uno-mode-copy');
    if (copy) copy.textContent = action === 'bot' ? 'Choose Classic or Flex for Bot Mode.' : action === 'join' ? 'Choose the ruleset of the room you are joining.' : 'Choose Classic or Flex for the room you are creating.';
    picker.showModal();
  };

  const runClassic = () => {
    const action = pendingAction;
    pendingAction = null;
    picker.close();
    bypassClassic = true;
    try {
      if (action === 'bot') botButton?.click();
      else if (action === 'join') joinForm?.requestSubmit();
      else createForm?.requestSubmit();
    } finally {
      setTimeout(() => { bypassClassic = false; }, 0);
    }
  };

  const runFlex = () => {
    const action = pendingAction || 'create';
    pendingAction = null;
    picker.close();
    const params = new URLSearchParams({
      entry: action,
      name: playerName(),
      avatar: selectedAvatar(),
    });
    if (action === 'join') {
      const code = roomCode();
      if (code.length !== 4) {
        if (typeof notify === 'function') notify('৪ অক্ষরের রুম কোড দাও 😄');
        return;
      }
      params.set('roomCode', code);
    }
    location.href = `/flex/?${params.toString()}`;
  };

  play?.addEventListener('click', activateUno);
  unoTile?.addEventListener('click', activateUno);
  activateHome();

  createForm?.addEventListener('submit', (e) => {
    if (bypassClassic) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!playerName()) return;
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
      if (typeof notify === 'function') notify(`${name} — coming soon by DBT 🚧🔥`);
    });
  });

  document.querySelectorAll('.launcher-tab').forEach((button) => {
    if (!button.classList.contains('active')) button.addEventListener('click', () => {
      if (typeof notify === 'function') notify('DBT Media — coming soon 🎬🔥');
    });
  });

  try {
    socket.on('connect', () => { if (!gameOpened && !state) activateHome(); });
    socket.on('s_sync_state', () => { gameOpened = true; home.hidden = true; document.body.classList.remove('launcher-active'); });
    socket.on('s_room_created', () => { gameOpened = true; home.hidden = true; document.body.classList.remove('launcher-active'); });
  } catch {}
})();