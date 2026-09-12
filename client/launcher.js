(() => {
  const home = document.getElementById('home');
  const menu = document.getElementById('menu');
  const lobby = document.getElementById('lobby');
  const board = document.getElementById('board');
  const play = document.getElementById('home-play-uno');
  const unoTile = document.querySelector('.game-tile[data-game="uno"]');
  const homeButton = document.getElementById('home-button');
  if (!home || !menu) return;

  let gameOpened = false;

  const activateHome = () => {
    gameOpened = false;
    home.hidden = false;
    menu.hidden = true;
    if (lobby) lobby.hidden = true;
    if (board) board.hidden = true;
    document.body.classList.add('launcher-active');
  };

  const activateGame = () => {
    gameOpened = true;
    home.hidden = true;
    document.body.classList.remove('launcher-active');
    menu.hidden = false;
    setTimeout(() => document.getElementById('name')?.focus(), 60);
  };

  activateHome();
  play?.addEventListener('click', activateGame);
  unoTile?.addEventListener('click', activateGame);

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
