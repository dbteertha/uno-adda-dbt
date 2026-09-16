(() => {
  if (window.__dbtPhotoReferenceTheme) return;
  window.__dbtPhotoReferenceTheme = true;
  document.body.classList.add('dbt-photo-theme');

  const ensureHero = () => {
    const featured = document.querySelector('.featured-game');
    if (!featured) return;
    const h1 = featured.querySelector('.featured-copy h1');
    if (h1) h1.innerHTML = '<span>MISTI &amp; SUJI</span> UNO ADDA';
    const chip = featured.querySelector('.made-chip');
    if (chip) chip.textContent = 'DBT GAMES · CATS · CARDS · COMMUNITY';
    const actions = featured.querySelector('.featured-actions');
    if (actions && !featured.querySelector('.reference-hero-copy')) {
      const p = document.createElement('p');
      p.className = 'reference-hero-copy';
      p.innerHTML = '<b>Same game. Brighter people. More chaos.</b><br>Misti hosts the table. Suji keeps it unpredictable.';
      actions.before(p);
      const m = document.createElement('span');
      m.className = 'reference-cat-note misti';
      m.textContent = 'Good games bring people together ♥';
      const s = document.createElement('span');
      s.className = 'reference-cat-note suji';
      s.textContent = 'Same game. More drama! ♥';
      featured.append(m,s);
    }
    const btn = document.getElementById('home-play-uno');
    if (btn) btn.textContent = 'PLAY NOW';
    const sub = actions?.querySelector('span');
    if (sub) sub.textContent = 'Classic · Flex · Multiplayer · Bots · Misti & Suji everywhere';
  };

  const ensureHub = () => {
    const menu = document.getElementById('menu');
    if (!menu) return;
    if (!menu.querySelector('.reference-hub-title')) {
      const title = document.createElement('div');
      title.className = 'reference-hub-title';
      title.innerHTML = '<b>UNO ADDA</b><span>PLAY · CHAT · BOND · REPEAT</span>';
      const pill = menu.querySelector('.live-pill');
      (pill || menu.firstChild)?.after?.(title);
    }
    const rooms = document.getElementById('room-browser');
    const users = menu.querySelector('.suggested-users');
    if (rooms && users && !menu.querySelector('.reference-hub-grid')) {
      const grid = document.createElement('div');
      grid.className = 'reference-hub-grid';
      rooms.before(grid);
      grid.append(rooms, users);
    }
    const menuTitle = menu.querySelector(':scope > h1');
    if (menuTitle) menuTitle.innerHTML = 'Choose your <span>table</span>';
    const menuP = menu.querySelector(':scope > p');
    if (menuP) menuP.textContent = 'Create a room, join friends, or jump into bot mode.';
  };

  const relabelCats = () => {
    const c = document.getElementById('commentator-name');
    const t = document.getElementById('commentary-text');
    if (c && /bean/i.test(c.textContent || '')) c.textContent = '🐾 MISTI & SUJI';
    if (t && /bean/i.test(t.textContent || '')) t.textContent = 'Misti and Suji are watching the table…';
  };

  const improveButtons = () => {
    const create = document.querySelector('#create button[type="submit"]');
    if (create) create.textContent = 'CREATE ROOM';
    const bot = document.getElementById('bot-play');
    if (bot) bot.textContent = 'BOT MODE';
    const join = document.querySelector('#join button[type="submit"]');
    if (join) join.textContent = 'JOIN ROOM';
    const ready = document.getElementById('ready');
    if (ready && !/ready/i.test(ready.textContent || '')) ready.textContent = 'READY';
  };

  const addScreenLabels = () => {
    const labels = [
      ['#room-browser','ACTIVE ROOMS'],['.suggested-users','ONLINE USERS'],['#classic-rules-panel','SPECIAL POWER-CARD EXPLANATION'],
      ['.party-dock','FAST TROLL / EMOJI REACTIONS'],['#commentary','TURN COMMENTARY'],['#results','WINNER SCREEN']
    ];
    labels.forEach(([sel,text]) => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.dataset.refLabeled) return;
        el.dataset.refLabeled='1';
        el.setAttribute('data-reference-title', text);
      });
    });
  };

  const decorateFlex = () => {
    if (!location.pathname.startsWith('/flex')) return;
    document.body.classList.add('reference-flex');
    const top = document.querySelector('.flex-top div');
    if (top) top.innerHTML = '<b>UNO FLEX</b><small>Misti & Suji chaos mode</small>';
    const hero = document.querySelector('#mode .hero');
    if (hero && !hero.querySelector('.reference-flex-cats')) {
      const row = document.createElement('div');
      row.className = 'reference-flex-cats';
      row.innerHTML = '<img src="/misti.svg?v=3" alt="Misti"><div><b>MISTI &amp; SUJI</b><span>Choose your mode</span></div><img src="/suji.svg?v=3" alt="Suji">';
      hero.prepend(row);
    }
  };

  const boot = () => { ensureHero(); ensureHub(); relabelCats(); improveButtons(); addScreenLabels(); decorateFlex(); };
  boot();
  const observer = new MutationObserver(() => requestAnimationFrame(boot));
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
