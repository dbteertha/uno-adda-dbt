(() => {
  if (window.__dbtCatMascots) return;
  window.__dbtCatMascots = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/cat-mascots.css?v=1';
  document.head.appendChild(css);

  const ASSET = { misti:'/misti.svg', suji:'/suji.svg' };
  const duo = document.createElement('div');
  duo.id = 'cat-duo';
  duo.innerHTML = `
    <div class="cat-mascot misti" data-cat="misti"><div class="cat-speech"></div><img src="${ASSET.misti}" alt="Misti cartoon mascot"></div>
    <div class="cat-mascot suji" data-cat="suji"><div class="cat-speech"></div><img src="${ASSET.suji}" alt="Suji cartoon mascot"></div>`;
  document.body.appendChild(duo);

  const pop = document.createElement('div');
  pop.className = 'cat-react-pop';
  pop.innerHTML = `<img src="${ASSET.misti}" alt=""><div><b></b><small></small></div>`;
  document.body.appendChild(pop);

  const cats = {
    misti: duo.querySelector('[data-cat="misti"]'),
    suji: duo.querySelector('[data-cat="suji"]')
  };
  let speakTimer = null, popTimer = null, lastLine = '';

  const lines = {
    entry:[['misti','Welcome. Name first, chaos later.'],['suji','Pick a name. I need someone to blame 😼']],
    home:[['misti','Ready for a clean win?'],['suji','Ready for bad decisions? Perfect.']],
    create:[['misti','New table. New strategy.'],['suji','Fresh room! Fresh victims 😹']],
    join:[['misti','Room code checked. Let’s go.'],['suji','Sneaking into another table 👀']],
    bot:[['misti','Bots are useful practice.'],['suji','If the bot wins I saw nothing.']],
    classic:[['misti','Classic rewards timing.'],['suji','Classic still has plenty of chaos.']],
    flex:[['misti','Flex changes the decision tree.'],['suji','POWER SIDE GO BRRR ⚡']],
    ready:[['misti','Ready status confirmed.'],['suji','START IT ALREADY 😼']],
    draw:[['misti','One card. Recalculate.'],['suji','Shopping again? 😂']],
    uno:[['misti','One card left. Stay sharp.'],['suji','UNO PANIC DETECTED 🚨']],
    reverse:[['misti','Direction changed. Adapt.'],['suji','NO U ↩️']],
    skip:[['misti','Turn denied.'],['suji','Sit down 😹']],
    draw2:[['misti','Two-card pressure.'],['suji','+2 tax collected.']],
    draw4:[['misti','That changes the whole round.'],['suji','+4! Friendship cancelled 😈']],
    wild:[['misti','Color control matters here.'],['suji','Rainbow nonsense activated 🌈']],
    power:[['misti','Use powers at the right moment.'],['suji','PRESS THE SHINY BUTTON ⚡']],
    share:[['misti','Invite link copied.'],['suji','Bring more humans 😼']],
    error:[['misti','Something failed. We’ll recover.'],['suji','The internet escaped again.']],
    win:[['misti','Excellent table control.'],['suji','CROWN THEM 👑']],
    rematch:[['misti','Review. Adapt. Rematch.'],['suji','RUN IT BACK 😹']],
    leave:[['misti','Leaving the table.'],['suji','Cowardly but understandable 😼']],
    tutorial:[['misti','I’ll explain the rule.'],['suji','I’ll demonstrate the bad idea.']],
    editor:[['misti','Make precise changes.'],['suji','Move everything two pixels for fun.']],
    analytics:[['misti','Useful data, clean decisions.'],['suji','Humans spotted 👀']],
    idle:[['misti','I’m still watching the table.'],['suji','...I may have fallen asleep.']]
  };

  const choose = (key) => {
    const arr = lines[key] || lines.home;
    return arr[Math.floor(Math.random()*arr.length)];
  };

  function speak(key, forceCat) {
    const [catName, line] = choose(key);
    const name = forceCat || catName;
    if (line === lastLine) return;
    lastLine = line;
    clearTimeout(speakTimer);
    Object.values(cats).forEach(c => c.classList.remove('speaking','alert','sleepy','smug'));
    const cat = cats[name];
    if (!cat) return;
    cat.querySelector('.cat-speech').textContent = line;
    cat.classList.add('speaking', key === 'idle' ? 'sleepy' : 'alert');
    speakTimer = setTimeout(()=>cat.classList.remove('speaking','alert','sleepy','smug'), 3200);
  }

  function reaction(catName, title, detail='') {
    clearTimeout(popTimer);
    pop.querySelector('img').src = ASSET[catName] || ASSET.misti;
    pop.querySelector('b').textContent = title;
    pop.querySelector('small').textContent = detail;
    pop.classList.add('show');
    for (let i=0;i<4;i++) {
      const paw = document.createElement('div');
      paw.className = 'cat-paw-burst';
      paw.textContent = i%2 ? '🐾' : '✨';
      paw.style.left = `${42 + Math.random()*16}%`;
      paw.style.top = `${20 + Math.random()*10}%`;
      document.body.appendChild(paw);
      setTimeout(()=>paw.remove(),1200);
    }
    popTimer = setTimeout(()=>pop.classList.remove('show'), 2200);
  }

  function addCorner(el, catName, side='right') {
    if (!el || el.querySelector(`:scope > .cat-corner.${catName}`)) return;
    el.classList.add('cat-sector');
    const img = document.createElement('img');
    img.className = `cat-corner ${catName} ${side}`;
    img.src = ASSET[catName]; img.alt = `${catName === 'misti' ? 'Misti' : 'Suji'} mascot`;
    el.appendChild(img);
  }

  function addHost(el, catName, text) {
    if (!el || el.querySelector(':scope > .cat-inline-host')) return;
    const host = document.createElement('div');
    host.className = 'cat-inline-host';
    host.innerHTML = `<img src="${ASSET[catName]}" alt=""><div><strong>${catName === 'misti' ? 'মিষ্টি · Misti' : 'সুজি · Suji'}</strong><span>${text}</span></div>`;
    el.prepend(host);
  }

  function decorate() {
    const map = [
      ['#home','misti','left'], ['#menu','suji','right'], ['#lobby','misti','left'], ['#board','suji','right'],
      ['#name-gate','misti','left'], ['#uno-mode-picker','suji','right'], ['#colors','misti','left'], ['#results','suji','right'],
      ['#history-dialog','misti','left'], ['#power-dialog','suji','right'], ['.quick-tutorial-dialog','misti','left'],
      ['#classic-rules-panel','misti','left'], ['#classic-power-dock','suji','right'], ['.classic-power-dialog','suji','right'],
      ['#room-browser','misti','left'], ['.suggested-users','suji','right'], ['.party-dock','suji','right'], ['.arena','misti','left']
    ];
    map.forEach(([sel,cat,side])=>document.querySelectorAll(sel).forEach(el=>addCorner(el,cat,side)));

    document.querySelectorAll('dialog').forEach((d,i)=>addCorner(d, i%2?'suji':'misti', i%2?'right':'left'));
    document.querySelectorAll('section,form,.panel,.featured-game,.coming-section').forEach(el=>el.classList.add('cat-sector'));

    const commentary = document.getElementById('commentary');
    if (commentary && !commentary.dataset.catHosted) {
      commentary.dataset.catHosted='1';
      addHost(commentary,'misti','Table host · strategy + commentary');
    }
    const flexTutorial = document.querySelector('.quick-tutorial-dialog');
    if (flexTutorial) addHost(flexTutorial,'misti','Rule guide — Suji may interrupt.');
  }

  const clickMap = [
    ['#home-play-uno,.game-tile[data-game="uno"]','entry'], ['#gate-continue','home'], ['#create button[type="submit"]','create'], ['#join button[type="submit"]','join'],
    ['#bot-play','bot'], ['#choose-classic','classic'], ['#choose-flex','flex'], ['#ready','ready'], ['#draw','draw'], ['#uno','uno'], ['#copy,#share,#copy-classic-link,#copy-flex-link','share'],
    ['#rematch','rematch'], ['.leave','leave'], ['#power-help,#lobby-power-help,.classic-power-card','power'], ['#lobby-tutorial,#open-flex-tutorial','tutorial']
  ];

  document.addEventListener('click', e => {
    for (const [sel,key] of clickMap) {
      if (e.target.closest?.(sel)) { speak(key); break; }
    }
    if (e.target.closest?.('#draw')) reaction('suji','CARD SHOPPING','Suji is judging the draw pile.');
    if (e.target.closest?.('#uno')) reaction('misti','UNO!','Misti approves the timing.');
  }, true);

  document.addEventListener('input', e => {
    if (e.target.matches?.('#gate-name,#name')) speak('entry','misti');
    if (e.target.matches?.('#code')) speak('join','suji');
  });

  function inspectText(text='') {
    const t = String(text).toLowerCase();
    if (!t) return;
    if (t.includes('+4') || t.includes('draw four')) { speak('draw4'); reaction('suji','+4 CHAOS','Friendship temporarily suspended.'); }
    else if (t.includes('+2') || t.includes('draw two')) speak('draw2');
    else if (t.includes('reverse')) speak('reverse');
    else if (t.includes('skip')) speak('skip');
    else if (t.includes('wild')) speak('wild');
    else if (t.includes('winner') || t.includes('wins') || t.includes('you win')) { speak('win'); reaction('misti','VICTORY','Misti & Suji approve.'); }
    else if (t.includes('disconnect') || t.includes('error') || t.includes('failed')) speak('error');
    else if (t.includes('power') || t.includes('magnet') || t.includes('shield') || t.includes('robbery') || t.includes('freeze')) speak('power');
  }

  const watched = ['toast','commentary-text','turn','winner','result-reason','disconnect','troll-banner','devil-flash','classic-power-status'];
  watched.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(()=>inspectText(el.textContent)).observe(el,{childList:true,subtree:true,characterData:true});
  });

  if (window.DBT_CLASSIC_SOCKET?.on) {
    window.DBT_CLASSIC_SOCKET.on('s_power_notice', d => inspectText(d?.message));
    window.DBT_CLASSIC_SOCKET.on('disconnect', ()=>speak('error'));
    window.DBT_CLASSIC_SOCKET.on('connect', ()=>speak('home','misti'));
  }

  let idleTimer;
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(()=>speak('idle'), 30000); };
  ['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,resetIdle,{passive:true}));
  resetIdle();

  decorate();
  new MutationObserver(decorate).observe(document.documentElement,{childList:true,subtree:true});
  speak(location.pathname.startsWith('/flex/') ? 'flex' : 'home');
})();