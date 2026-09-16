(() => {
  if (window.__dbtCatMascotsV2) return;
  window.__dbtCatMascotsV2 = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/cat-mascots.css?v=2';
  document.head.appendChild(css);

  const ASSET = { misti:'/misti.svg?v=2', suji:'/suji.svg?v=2' };
  const NAMES = { misti:'মিষ্টি · Misti', suji:'সুজি · Suji' };
  const roles = { misti:'TABLE QUEEN', suji:'CHAOS ASSISTANT' };

  const stage = document.createElement('aside');
  stage.id = 'cat-stage';
  stage.innerHTML = `
    <button class="stage-cat misti" data-cat="misti" type="button" aria-label="Misti"><span class="cat-bubble"></span><img src="${ASSET.misti}" alt="Misti cartoon character"><i class="cat-prop"></i></button>
    <button class="stage-cat suji" data-cat="suji" type="button" aria-label="Suji"><span class="cat-bubble"></span><img src="${ASSET.suji}" alt="Suji cartoon character"><i class="cat-prop"></i></button>`;
  document.body.appendChild(stage);

  const eventCard = document.createElement('div');
  eventCard.id = 'cat-event-card';
  eventCard.innerHTML = `<img alt=""><div><small></small><b></b><span></span></div>`;
  document.body.appendChild(eventCard);

  const stageCats = {
    misti: stage.querySelector('[data-cat="misti"]'),
    suji: stage.querySelector('[data-cat="suji"]')
  };
  let talkTimer = null, eventTimer = null, lastLine = '', mood = 'idle';

  const dialogue = {
    entry:[['misti','Name first. Then I judge your strategy.','✍️'],['suji','Type fast. I have chaos scheduled.','😼']],
    home:[['misti','Choose your table carefully.','🎴'],['suji','Press PLAY. I promise absolutely nothing.','⚡']],
    create:[['misti','I’ll keep the new table organized.','🪑'],['suji','New room means new victims—friends. Friends.','😹']],
    join:[['misti','Room code looks good.','🔐'],['suji','We are entering dramatically.','🚪']],
    bot:[['misti','Observe patterns. Bots repeat themselves.','🤖'],['suji','Lose to the bot and we never discuss it.','🙈']],
    classic:[['misti','Classic: timing, memory, restraint.','🎴'],['suji','Classic: pretend strategy until +4 happens.','💥']],
    flex:[['misti','Flex rewards planning around Power state.','⚡'],['suji','Two sides per card? Excellent. More trouble.','😈']],
    ready:[['misti','Ready. Eyes on the table.','✅'],['suji','EVERYBODY READY? LET ME IN.','🚨']],
    draw:[['misti','New information. Recalculate.','🃏'],['suji','Card shopping again?','🛒']],
    uno:[['misti','One card. No mistakes now.','👑'],['suji','UNO PANIC MODE!','🚨']],
    reverse:[['misti','Direction changed. Re-map the table.','↩️'],['suji','NO U.','🔄']],
    skip:[['misti','Turn denied.','⏭️'],['suji','Bench time 😹','🪑']],
    draw2:[['misti','Two-card swing.','+2'],['suji','Small tax. Big feelings.','😼']],
    draw4:[['misti','Four cards can flip the round.','+4'],['suji','FRIENDSHIP CANCELLED FOR ONE TURN.','💣']],
    wild:[['misti','Color control is leverage.','🌈'],['suji','Pick the color that annoys them most.','🎨']],
    power:[['misti','Powers are strongest when saved for timing.','🛡️'],['suji','SHINY BUTTON = PRESS.','⚡']],
    share:[['misti','Invite copied. Build the table.','🔗'],['suji','Bring more humans.','👀']],
    error:[['misti','Stay put. We can recover.','🧰'],['suji','The internet ran under the sofa.','📡']],
    win:[['misti','Clean finish. Well played.','🏆'],['suji','CROWN! CONFETTI! CHAOS!','👑']],
    rematch:[['misti','Adjust and run it back.','🔁'],['suji','REVENGE BUTTON. NOW.','🔥']],
    leave:[['misti','Table closed. See you next round.','👋'],['suji','Escaping already? Suspicious.','🏃']],
    tutorial:[['misti','I’ll explain. Watch the examples.','📘'],['suji','I volunteer as the bad example.','🙋']],
    editor:[['misti','Precise edits only.','🛠️'],['suji','I moved it three pixels. Art.','🎨']],
    analytics:[['misti','Useful numbers. Better decisions.','📊'],['suji','Human activity detected.','👀']],
    idle:[['misti','I’m watching the table.','👁️'],['suji','Wake me when someone plays +4.','💤']]
  };

  function pick(key) {
    const set = dialogue[key] || dialogue.home;
    return set[Math.floor(Math.random() * set.length)];
  }

  function pose(catName, key, prop='') {
    const el = stageCats[catName];
    if (!el) return;
    el.dataset.pose = key;
    el.querySelector('.cat-prop').textContent = prop;
  }

  function talk(key, forcedCat) {
    const [defaultCat,line,prop] = pick(key);
    const catName = forcedCat || defaultCat;
    if (line === lastLine && !forcedCat) return;
    lastLine = line;
    clearTimeout(talkTimer);
    Object.values(stageCats).forEach(el => el.classList.remove('talking','active','sleeping'));
    const cat = stageCats[catName];
    if (!cat) return;
    cat.querySelector('.cat-bubble').textContent = line;
    cat.classList.add('talking','active');
    if (key === 'idle') cat.classList.add('sleeping');
    pose(catName, key, prop);
    talkTimer = setTimeout(() => cat.classList.remove('talking','active'), 3400);
  }

  function event(catName, title, detail, key='home', prop='✨') {
    clearTimeout(eventTimer);
    mood = key;
    const cat = catName || 'misti';
    eventCard.querySelector('img').src = ASSET[cat];
    eventCard.querySelector('small').textContent = `${NAMES[cat]} · ${roles[cat]}`;
    eventCard.querySelector('b').textContent = title;
    eventCard.querySelector('span').textContent = detail || '';
    eventCard.dataset.mood = key;
    eventCard.classList.add('show');
    pose(cat,key,prop);
    burst(key === 'win' ? ['🏆','✨','🐾','👑'] : key === 'draw4' ? ['+4','💥','🐾','😈'] : ['🐾','✨','🎴']);
    eventTimer = setTimeout(() => eventCard.classList.remove('show'), 2300);
  }

  function burst(symbols) {
    for (let i=0;i<6;i++) {
      const el = document.createElement('i');
      el.className = 'cat-fx';
      el.textContent = symbols[i % symbols.length];
      el.style.left = `${28 + Math.random()*44}%`;
      el.style.top = `${35 + Math.random()*18}%`;
      el.style.setProperty('--dx',`${Math.round((Math.random()-.5)*180)}px`);
      document.body.appendChild(el);
      setTimeout(()=>el.remove(),1100);
    }
  }

  function sceneHTML(kind,cat,title,copy,prop) {
    return `<div class="cat-scene ${kind}" data-cat-scene="${kind}"><div class="scene-character ${cat}" data-scene-pose="${kind}"><img src="${ASSET[cat]}" alt="${NAMES[cat]}"><i>${prop || ''}</i></div><div class="scene-copy"><small>${NAMES[cat]} · ${roles[cat]}</small><b>${title}</b><span>${copy}</span></div></div>`;
  }

  function injectScene(target, kind, cat, title, copy, prop, where='afterbegin') {
    if (!target || target.querySelector(`[data-cat-scene="${kind}"]`)) return;
    target.insertAdjacentHTML(where, sceneHTML(kind,cat,title,copy,prop));
  }

  function decorate() {
    document.querySelectorAll('.cat-corner').forEach(el=>el.remove());
    document.querySelectorAll('.cat-sector::after');

    injectScene(document.querySelector('.featured-game'),'home-hero','misti','The table is open','Misti hosts the table. Suji supplies the bad ideas.','🎴');
    injectScene(document.getElementById('room-browser'),'rooms','suji','Room hunter','Suji keeps an eye on open tables and nearly-full rooms.','👀');
    injectScene(document.getElementById('lobby'),'lobby','misti','Lobby host','Players in, ready up, rules checked.','✅');
    injectScene(document.getElementById('classic-rules-panel'),'rules','misti','Rules desk','Misti explains the loadout while Suji waits for the dangerous buttons.','📘');
    injectScene(document.getElementById('classic-power-dock'),'powers','suji','Power desk','Suji reacts when tactical cards come online.','⚡');
    injectScene(document.querySelector('.quick-tutorial-dialog'),'tutorial','misti','Rule school','Misti teaches. Suji demonstrates what not to do.','📚');
    injectScene(document.querySelector('.party-dock'),'party','suji','Reaction booth','Fast trolls, sounds and maximum side-eye.','😹');

    const arena = document.querySelector('.arena');
    if (arena && !arena.querySelector('[data-cat-scene="table"]')) {
      arena.insertAdjacentHTML('afterbegin', `<div class="cat-table-watch" data-cat-scene="table"><div class="watch-cat misti"><img src="${ASSET.misti}" alt="Misti"><span>Misti watches strategy</span></div><div class="watch-cat suji"><img src="${ASSET.suji}" alt="Suji"><span>Suji watches chaos</span></div></div>`);
    }

    const nameGate = document.getElementById('name-gate');
    if (nameGate) injectScene(nameGate,'entry','misti','Welcome to the table','Enter your name. The cats handle the rest.','✍️');
    const picker = document.getElementById('uno-mode-picker');
    if (picker) injectScene(picker,'mode','suji','Choose your chaos','Classic is cleaner. Flex is louder.','⚡');
    const results = document.getElementById('results');
    if (results) injectScene(results,'results','misti','Round verdict','Misti keeps score. Suji keeps receipts.','🏆');
    const colors = document.getElementById('colors');
    if (colors) injectScene(colors,'colors','suji','Pick a color','Suji recommends whichever color causes problems.','🌈');
  }

  const clickMap = [
    ['#home-play-uno,.game-tile[data-game="uno"]','entry'], ['#gate-continue','home'], ['#create button[type="submit"]','create'], ['#join button[type="submit"]','join'], ['#bot-play','bot'], ['#choose-classic','classic'], ['#choose-flex','flex'], ['#ready','ready'], ['#draw','draw'], ['#uno','uno'], ['#copy,#share,#copy-classic-link,#copy-flex-link','share'], ['#rematch','rematch'], ['.leave','leave'], ['#power-help,#lobby-power-help,.classic-power-card','power'], ['#lobby-tutorial,#open-flex-tutorial','tutorial']
  ];

  document.addEventListener('click', e => {
    const catButton = e.target.closest?.('.stage-cat');
    if (catButton) {
      const cat = catButton.dataset.cat;
      talk(mood === 'idle' ? 'home' : mood, cat);
      event(cat, cat === 'misti' ? 'Misti is watching' : 'Suji noticed that', cat === 'misti' ? 'Strategy mode engaged.' : 'Chaos level acceptable.', 'home', cat === 'misti' ? '👑' : '😼');
      return;
    }
    for (const [sel,key] of clickMap) {
      if (e.target.closest?.(sel)) { talk(key); break; }
    }
    if (e.target.closest?.('#draw')) event('suji','CARD SHOPPING','Another card joins the collection.','draw','🃏');
    if (e.target.closest?.('#uno')) event('misti','UNO!','One-card pressure is officially active.','uno','🚨');
    if (e.target.closest?.('#rematch')) event('suji','RUN IT BACK','Suji has already approved the rematch.','rematch','🔥');
  }, true);

  document.addEventListener('input', e => {
    if (e.target.matches?.('#gate-name,#name')) talk('entry','misti');
    if (e.target.matches?.('#code')) talk('join','suji');
  });

  function inspectText(text='') {
    const t = String(text).toLowerCase();
    if (!t) return;
    if (t.includes('+4') || t.includes('draw four')) { talk('draw4'); event('suji','+4 DETECTED','Suji says diplomacy has failed.','draw4','+4'); }
    else if (t.includes('+2') || t.includes('draw two')) { talk('draw2'); event('suji','+2 TAX','A small disaster has arrived.','draw2','+2'); }
    else if (t.includes('reverse')) { talk('reverse'); event('suji','REVERSE','Everybody turn around.','reverse','↩️'); }
    else if (t.includes('skip')) { talk('skip'); event('misti','SKIPPED','Turn denied by the table.','skip','⏭️'); }
    else if (t.includes('wild')) { talk('wild'); event('misti','COLOR CONTROL','The table just changed shape.','wild','🌈'); }
    else if (t.includes('winner') || t.includes('wins') || t.includes('you win')) { talk('win'); event('misti','VICTORY','Misti awards the crown. Suji claims partial credit.','win','👑'); }
    else if (t.includes('disconnect') || t.includes('error') || t.includes('failed')) { talk('error'); event('misti','CONNECTION TROUBLE','Both cats are guarding your seat.','error','📡'); }
    else if (t.includes('power') || t.includes('magnet') || t.includes('shield') || t.includes('robbery') || t.includes('freeze')) { talk('power'); event('suji','POWER CARD','Things are about to become unnecessarily dramatic.','power','⚡'); }
  }

  ['toast','commentary-text','turn','winner','result-reason','disconnect','troll-banner','devil-flash','classic-power-status'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(()=>inspectText(el.textContent)).observe(el,{childList:true,subtree:true,characterData:true});
  });

  if (window.DBT_CLASSIC_SOCKET?.on) {
    let lastTurn = '';
    window.DBT_CLASSIC_SOCKET.on('s_sync_state', state => {
      if (!state || state.status !== 'PLAYING') return;
      const current = (state.players || []).find(p=>p.isCurrent);
      const key = `${state.round || 0}:${current?.displayName || ''}:${current?.seat ?? ''}`;
      if (current && key !== lastTurn) {
        lastTurn = key;
        pose('misti','watch','👁️');
        pose('suji','watch','🎴');
      }
      const me = (state.players || []).find(p=>p.isMe);
      if (me?.handCount === 1) talk('uno');
    });
    window.DBT_CLASSIC_SOCKET.on('s_power_notice', d => inspectText(d?.message));
    window.DBT_CLASSIC_SOCKET.on('disconnect', ()=>talk('error'));
  }

  let idleTimer;
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(()=>{ talk('idle'); pose('suji','idle','💤'); }, 26000); };
  ['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,resetIdle,{passive:true}));
  resetIdle();

  decorate();
  new MutationObserver(decorate).observe(document.documentElement,{childList:true,subtree:true});
  talk(location.pathname.startsWith('/flex/') ? 'flex' : 'home','misti');
})();