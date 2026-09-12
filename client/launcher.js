(() => {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/flex-home.css';
  document.head.appendChild(css);

  const home = document.getElementById('home');
  const menu = document.getElementById('menu');
  const lobby = document.getElementById('lobby');
  const board = document.getElementById('board');
  const play = document.getElementById('home-play-uno');
  const unoTile = document.querySelector('.game-tile[data-game="uno"]');
  const homeButton = document.getElementById('home-button');
  if (!home || !menu) return;

  if (unoTile) {
    unoTile.querySelector('span:last-child')?.replaceWith(Object.assign(document.createElement('span'), { textContent: 'UNO Classic' }));
    const sub = document.createElement('small');
    sub.textContent = 'Bot · Multi';
    unoTile.appendChild(sub);

    if (!document.querySelector('[data-game="flex"]')) {
      const flexTile = document.createElement('button');
      flexTile.className = 'game-tile flex-tile';
      flexTile.dataset.game = 'flex';
      flexTile.type = 'button';
      flexTile.setAttribute('aria-label', 'UNO Flex');
      flexTile.innerHTML = '<span class="tile-icon flex-mini">FLEX</span><span>UNO Flex</span><small>Bot · Multi</small>';
      unoTile.insertAdjacentElement('afterend', flexTile);
    }
  }

  if (play) {
    play.textContent = '▶ PLAY UNO CLASSIC';
    if (!document.getElementById('home-play-flex')) {
      const flexPlay = document.createElement('button');
      flexPlay.id = 'home-play-flex';
      flexPlay.className = 'launch-btn flex-launch';
      flexPlay.type = 'button';
      flexPlay.textContent = '⚡ PLAY UNO FLEX';
      play.insertAdjacentElement('afterend', flexPlay);
    }
  }

  const picker = document.createElement('dialog');
  picker.id = 'mode-picker';
  picker.className = 'mode-picker';
  picker.innerHTML = `
    <button id="mode-close" class="mode-close" type="button">×</button>
    <div class="mode-kicker">DBT GAMES · CHOOSE MODE</div>
    <h2 id="mode-title">UNO Classic</h2>
    <p id="mode-copy">Choose Bot Mode or Multiplayer.</p>
    <div class="mode-options">
      <button id="mode-bot" class="mode-option" type="button"><span>🤖</span><b>BOT MODE</b><small>Play instantly against bots</small></button>
      <button id="mode-multi" class="mode-option" type="button"><span>👥</span><b>MULTIPLAYER</b><small>Create or join a room</small></button>
    </div>`;
  document.body.appendChild(picker);

  const flexTile = document.querySelector('.game-tile[data-game="flex"]');
  const flexPlay = document.getElementById('home-play-flex');
  const modeTitle = document.getElementById('mode-title');
  const modeCopy = document.getElementById('mode-copy');
  let gameOpened = false;
  let selectedGame = 'classic';

  const activateHome = () => {
    gameOpened = false;
    home.hidden = false;
    menu.hidden = true;
    if (lobby) lobby.hidden = true;
    if (board) board.hidden = true;
    document.body.classList.add('launcher-active');
  };

  const activateClassic = () => {
    gameOpened = true;
    home.hidden = true;
    document.body.classList.remove('launcher-active');
    menu.hidden = false;
    setTimeout(() => document.getElementById('name')?.focus(), 60);
  };

  const openPicker = (game) => {
    selectedGame = game;
    if (game === 'flex') {
      modeTitle.textContent = 'UNO Flex';
      modeCopy.textContent = 'Your complete flashcard tutorial opens first, then the selected mode starts.';
    } else {
      modeTitle.textContent = 'UNO Classic';
      modeCopy.textContent = 'Choose Bot Mode or Multiplayer.';
    }
    picker.showModal();
  };

  activateHome();
  play?.addEventListener('click', () => openPicker('classic'));
  unoTile?.addEventListener('click', () => openPicker('classic'));
  flexPlay?.addEventListener('click', () => openPicker('flex'));
  flexTile?.addEventListener('click', () => openPicker('flex'));

  document.getElementById('mode-close')?.addEventListener('click', () => picker.close());
  document.getElementById('mode-bot')?.addEventListener('click', () => {
    picker.close();
    if (selectedGame === 'flex') {
      location.href = '/flex/?mode=bot';
      return;
    }
    activateClassic();
    setTimeout(() => {
      const name = document.getElementById('name');
      if (name && !name.value.trim()) name.value = 'DBT Player';
      document.getElementById('bot-play')?.click();
    }, 120);
  });
  document.getElementById('mode-multi')?.addEventListener('click', () => {
    picker.close();
    if (selectedGame === 'flex') {
      location.href = '/flex/?mode=multi';
      return;
    }
    activateClassic();
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
      if (typeof notify === 'function') notify(`${name} — coming soon by DBT 🚧🔥`);
    });
  });

  document.querySelectorAll('.launcher-tab').forEach((button) => {
    if (!button.classList.contains('active')) {
      button.addEventListener('click', () => {
        if (typeof notify === 'function') notify('DBT Media — coming soon 🎬🔥');
      });
    }
  });

  try {
    socket.on('connect', () => {
      if (!gameOpened && !state) activateHome();
    });
    socket.on('s_sync_state', () => {
      gameOpened = true;
      home.hidden = true;
      document.body.classList.remove('launcher-active');
    });
    socket.on('s_room_created', () => {
      gameOpened = true;
      home.hidden = true;
      document.body.classList.remove('launcher-active');
    });
  } catch {}
})();
