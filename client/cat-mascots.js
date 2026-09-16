(() => {
  if (window.__dbtCatMascotsV3) return;
  window.__dbtCatMascotsV3 = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/cat-mascots.css?v=3';
  document.head.appendChild(css);

  const BASE = { misti:'/misti.svg?v=3', suji:'/suji.svg?v=3' };
  const NAMES = { misti:'মিষ্টি · Misti', suji:'সুজি · Suji' };
  const ROLES = { misti:'TABLE QUEEN', suji:'CHAOS ASSISTANT' };
  const expressionAssets = { misti:{normal:BASE.misti}, suji:{normal:BASE.suji} };
  const expressionByEvent = {
    entry:'curious', home:'normal', create:'happy', join:'curious', bot:'smug', classic:'focused', flex:'excited', ready:'happy',
    draw:'judging', uno:'shocked', reverse:'confused', skip:'smug', draw2:'shocked', draw4:'shocked', wild:'excited', power:'evil',
    share:'happy', error:'sad', win:'laughing', rematch:'excited', leave:'sad', tutorial:'focused', editor:'focused', analytics:'curious', idle:'sleepy'
  };

  async function buildExpressions(cat) {
    try {
      const source = await fetch(BASE[cat], { cache:'no-store' }).then(r => r.text());
      const expressions = ['normal','happy','laughing','angry','shocked','sleepy','smug','sad','curious','focused','excited','evil','judging','confused'];
      for (const expression of expressions) {
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
        const root = doc.documentElement;
        const eyes = [...root.querySelectorAll('ellipse')].filter(e => Number(e.getAttribute('cy') || 0) < 230).slice(0,4);
        const eyeShapes = eyes.slice(0,2), pupils = eyes.slice(2,4);
        const add = (markup) => root.insertAdjacentHTML('beforeend', markup);
        const cx = cat === 'misti' ? [125,235] : [122,238];
        const y = cat === 'misti' ? 173 : 171;
        const mouthY = cat === 'misti' ? 250 : 250;

        if (expression === 'happy' || expression === 'laughing') {
          eyeShapes.forEach(e => { e.setAttribute('ry','9'); e.setAttribute('fill','#fffdf8'); });
          pupils.forEach(e => e.setAttribute('ry','2'));
          add(`<path d="M${cx[0]-30} ${y}q30 20 60 0M${cx[1]-30} ${y}q30 20 60 0" fill="none" stroke="#2b1d15" stroke-width="7" stroke-linecap="round"/>`);
          add(expression === 'laughing'
            ? `<path d="M145 ${mouthY-6}q35 42 70 0-8 54-35 54t-35-54z" fill="#8d2d38" stroke="#4b2527" stroke-width="6"/><path d="M158 ${mouthY+24}q22 18 44 0" fill="none" stroke="#f28c99" stroke-width="8" stroke-linecap="round"/>`
            : `<path d="M145 ${mouthY}q35 30 70 0" fill="none" stroke="#57352f" stroke-width="7" stroke-linecap="round"/>`);
        } else if (expression === 'angry' || expression === 'evil') {
          add(`<path d="M88 ${y-36}l58 18M272 ${y-36}l-58 18" stroke="#2a1b14" stroke-width="11" stroke-linecap="round"/>`);
          pupils.forEach(e => { e.setAttribute('ry','18'); e.setAttribute('rx','6'); });
          add(expression === 'evil' ? `<path d="M142 ${mouthY+2}q38 24 76-4q-18 38-45 34-22-3-31-30z" fill="#7a2630" stroke="#4b2527" stroke-width="6"/><path d="M158 ${mouthY+10}l10 17 9-18M191 ${mouthY+8}l9 17 9-19" fill="#fff" stroke="#ddd" stroke-width="2"/>` : `<path d="M145 ${mouthY+18}q35-28 70 0" fill="none" stroke="#57352f" stroke-width="7" stroke-linecap="round"/>`);
        } else if (expression === 'shocked' || expression === 'excited') {
          eyeShapes.forEach(e => { e.setAttribute('rx', expression === 'shocked' ? '42':'38'); e.setAttribute('ry', expression === 'shocked' ? '38':'34'); });
          pupils.forEach(e => { e.setAttribute('rx','6'); e.setAttribute('ry','14'); });
          add(expression === 'shocked' ? `<ellipse cx="180" cy="${mouthY+18}" rx="18" ry="25" fill="#71313a" stroke="#54302e" stroke-width="6"/>` : `<path d="M145 ${mouthY-2}q35 40 70 0-8 45-35 45t-35-45z" fill="#8b2b36" stroke="#4b2527" stroke-width="6"/>`);
        } else if (expression === 'sleepy') {
          eyeShapes.forEach(e => { e.setAttribute('ry','4'); e.setAttribute('fill','#fffdf8'); });
          pupils.forEach(e => e.setAttribute('ry','1'));
          add(`<path d="M92 ${y}h66M202 ${y}h66" stroke="#2b1d15" stroke-width="7" stroke-linecap="round"/><text x="248" y="110" font-size="42" font-weight="900" fill="#b9c8ff">Z</text><text x="282" y="82" font-size="27" font-weight="900" fill="#d9e2ff">z</text>`);
        } else if (expression === 'smug' || expression === 'judging') {
          if (eyeShapes[1]) eyeShapes[1].setAttribute('ry','8');
          if (pupils[1]) pupils[1].setAttribute('ry','4');
          add(`<path d="M148 ${mouthY+6}q28 20 58-5" fill="none" stroke="#57352f" stroke-width="7" stroke-linecap="round"/>`);
          if (expression === 'judging') add(`<path d="M205 ${y-34}l55 9" stroke="#2a1b14" stroke-width="9" stroke-linecap="round"/>`);
        } else if (expression === 'sad') {
          add(`<path d="M90 ${y-24}q30-17 60 2M210 ${y-2}q30-24 60-2" fill="none" stroke="#2a1b14" stroke-width="8" stroke-linecap="round"/><path d="M145 ${mouthY+25}q35-30 70 0" fill="none" stroke="#57352f" stroke-width="7" stroke-linecap="round"/><path d="M257 ${y+28}q-12 22 0 34 12-12 0-34z" fill="#70c8ff" opacity=".88"/>`);
        } else if (expression === 'curious' || expression === 'confused') {
          add(`<path d="M92 ${y-34}q30-18 60 0M210 ${y-30}q30 12 60-5" fill="none" stroke="#2a1b14" stroke-width="8" stroke-linecap="round"/>`);
          if (expression === 'confused') add(`<text x="275" y="105" font-size="44" font-weight="900" fill="#ffd45c">?</text>`);
        } else if (expression === 'focused') {
          add(`<path d="M94 ${y-31}l55 9M266 ${y-31}l-55 9" stroke="#2a1b14" stroke-width="8" stroke-linecap="round" opacity=".8"/>`);
        }

        root.setAttribute('data-expression', expression);
        const text = new XMLSerializer().serializeToString(doc);
        expressionAssets[cat][expression] = URL.createObjectURL(new Blob([text], {type:'image/svg+xml'}));
      }
    } catch (err) {
      console.warn('Cat expressions unavailable', err);
    }
  }
  buildExpressions('misti');
  buildExpressions('suji');

  const stage = document.createElement('aside');
  stage.id = 'cat-stage';
  stage.innerHTML = `
    <button class="stage-cat misti" data-cat="misti" type="button" aria-label="Misti"><span class="cat-bubble"></span><img data-cat-art="misti" src="${BASE.misti}" alt="Misti cartoon character"><i class="cat-prop"></i></button>
    <button class="stage-cat suji" data-cat="suji" type="button" aria-label="Suji"><span class="cat-bubble"></span><img data-cat-art="suji" src="${BASE.suji}" alt="Suji cartoon character"><i class="cat-prop"></i></button>`;
  document.body.appendChild(stage);

  const eventCard = document.createElement('div');
  eventCard.id = 'cat-event-card';
  eventCard.innerHTML = `<img data-event-cat alt=""><div><small></small><b></b><span></span></div>`;
  document.body.appendChild(eventCard);

  const stageCats = { misti:stage.querySelector('[data-cat="misti"]'), suji:stage.querySelector('[data-cat="suji"]') };
  let talkTimer, eventTimer, lastLine='', mood='home';

  const dialogue = {
    entry:[['misti','Name first. Then I judge your strategy.','✍️'],['suji','Type fast. I have chaos scheduled.','😼']],
    home:[['misti','Choose your table carefully.','🎴'],['suji','Press PLAY. I promise absolutely nothing.','⚡']],
    create:[['misti','I’ll keep the new table organized.','🪑'],['suji','New room means new victims—friends.','😹']],
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
    idle:[['misti','I’m watching the table.','👁️'],['suji','Wake me when someone plays +4.','💤']]
  };

  const pick = key => (dialogue[key] || dialogue.home)[Math.floor(Math.random()*(dialogue[key] || dialogue.home).length)];
  function setExpression(cat, expression='normal', includeScenes=true) {
    const src = expressionAssets[cat]?.[expression] || expressionAssets[cat]?.normal || BASE[cat];
    document.querySelectorAll(`[data-cat-art="${cat}"]`).forEach((img,i) => { if (includeScenes || i===0) img.src = src; });
    const el = stageCats[cat];
    if (el) el.dataset.expression = expression;
  }
  function pose(cat,key,prop='') {
    const el=stageCats[cat]; if(!el) return;
    el.dataset.pose=key; el.querySelector('.cat-prop').textContent=prop;
    setExpression(cat, expressionByEvent[key] || 'normal');
  }
  function talk(key,forcedCat) {
    const [defaultCat,line,prop]=pick(key), cat=forcedCat||defaultCat;
    if(line===lastLine&&!forcedCat) return; lastLine=line; mood=key;
    clearTimeout(talkTimer);
    Object.values(stageCats).forEach(e=>e.classList.remove('talking','active','sleeping'));
    const el=stageCats[cat]; if(!el) return;
    el.querySelector('.cat-bubble').textContent=line; el.classList.add('talking','active');
    if(key==='idle') el.classList.add('sleeping');
    pose(cat,key,prop);
    const other=cat==='misti'?'suji':'misti';
    if(key==='draw4'||key==='win'||key==='error') setExpression(other,key==='win'?'happy':key==='error'?'sad':'shocked');
    talkTimer=setTimeout(()=>{ el.classList.remove('talking','active'); if(key!=='idle'){setExpression(cat,'normal');setExpression(other,'normal');} },3600);
  }
  function burst(symbols){for(let i=0;i<7;i++){const e=document.createElement('i');e.className='cat-fx';e.textContent=symbols[i%symbols.length];e.style.left=`${28+Math.random()*44}%`;e.style.top=`${35+Math.random()*18}%`;e.style.setProperty('--dx',`${Math.round((Math.random()-.5)*190)}px`);document.body.appendChild(e);setTimeout(()=>e.remove(),1100)}}
  function event(cat,title,detail,key='home',prop='✨') {
    clearTimeout(eventTimer); mood=key; const expression=expressionByEvent[key]||'normal';
    eventCard.querySelector('img').src=expressionAssets[cat]?.[expression]||BASE[cat];
    eventCard.querySelector('small').textContent=`${NAMES[cat]} · ${ROLES[cat]}`;
    eventCard.querySelector('b').textContent=title; eventCard.querySelector('span').textContent=detail||''; eventCard.dataset.mood=key; eventCard.classList.add('show');
    pose(cat,key,prop); burst(key==='win'?['🏆','✨','🐾','👑']:key==='draw4'?['+4','💥','🐾','😱']:['🐾','✨','🎴']);
    eventTimer=setTimeout(()=>eventCard.classList.remove('show'),2400);
  }

  function sceneHTML(kind,cat,title,copy,prop){return `<div class="cat-scene ${kind}" data-cat-scene="${kind}"><div class="scene-character ${cat}"><img data-cat-art="${cat}" src="${BASE[cat]}" alt="${NAMES[cat]}"><i>${prop||''}</i></div><div class="scene-copy"><small>${NAMES[cat]} · ${ROLES[cat]}</small><b>${title}</b><span>${copy}</span></div></div>`}
  function injectScene(target,kind,cat,title,copy,prop){if(!target||target.querySelector(`[data-cat-scene="${kind}"]`))return;target.insertAdjacentHTML('afterbegin',sceneHTML(kind,cat,title,copy,prop))}
  function decorate(){
    injectScene(document.querySelector('.featured-game'),'home-hero','misti','The table is open','Misti hosts strategy. Suji supplies trouble.','🎴');
    injectScene(document.getElementById('room-browser'),'rooms','suji','Room hunter','Suji scouts open tables.','👀');
    injectScene(document.getElementById('lobby'),'lobby','misti','Lobby host','Players in, ready up, rules checked.','✅');
    injectScene(document.getElementById('classic-rules-panel'),'rules','misti','Rules desk','Misti handles rules. Suji waits for dangerous buttons.','📘');
    injectScene(document.getElementById('classic-power-dock'),'powers','suji','Power desk','Suji watches tactical cards come online.','⚡');
    injectScene(document.querySelector('.quick-tutorial-dialog'),'tutorial','misti','Rule school','Misti teaches. Suji demonstrates the bad ideas.','📚');
    injectScene(document.querySelector('.party-dock'),'party','suji','Reaction booth','Fast trolls, sounds and side-eye.','😹');
    const arena=document.querySelector('.arena');
    if(arena&&!arena.querySelector('[data-cat-scene="table"]')) arena.insertAdjacentHTML('afterbegin',`<div class="cat-table-watch" data-cat-scene="table"><div class="watch-cat misti"><img data-cat-art="misti" src="${BASE.misti}" alt="Misti"><span>Misti watches strategy</span></div><div class="watch-cat suji"><img data-cat-art="suji" src="${BASE.suji}" alt="Suji"><span>Suji watches chaos</span></div></div>`);
    injectScene(document.getElementById('name-gate'),'entry','misti','Welcome to the table','Enter your name. The cats handle the rest.','✍️');
    injectScene(document.getElementById('uno-mode-picker'),'mode','suji','Choose your chaos','Classic is cleaner. Flex is louder.','⚡');
    injectScene(document.getElementById('results'),'results','misti','Round verdict','Misti keeps score. Suji keeps receipts.','🏆');
    injectScene(document.getElementById('colors'),'colors','suji','Pick a color','Suji recommends whichever causes problems.','🌈');
  }

  const clickMap=[['#home-play-uno,.game-tile[data-game="uno"]','entry'],['#gate-continue','home'],['#create button[type="submit"]','create'],['#join button[type="submit"]','join'],['#bot-play','bot'],['#choose-classic','classic'],['#choose-flex','flex'],['#ready','ready'],['#draw','draw'],['#uno','uno'],['#copy,#share,#copy-classic-link,#copy-flex-link','share'],['#rematch','rematch'],['.leave','leave'],['#power-help,#lobby-power-help,.classic-power-card','power'],['#lobby-tutorial,#open-flex-tutorial','tutorial']];
  document.addEventListener('click',e=>{
    const catButton=e.target.closest?.('.stage-cat'); if(catButton){const cat=catButton.dataset.cat;const expressions=['happy','smug','shocked','angry','laughing','curious','sleepy'];const ex=expressions[Math.floor(Math.random()*expressions.length)];setExpression(cat,ex);event(cat,`${NAMES[cat].split(' · ')[1]} reacts`,ex.toUpperCase(),ex==='sleepy'?'idle':'home',ex==='angry'?'💢':'🐾');return;}
    for(const [sel,key] of clickMap){if(e.target.closest?.(sel)){talk(key);break}}
    if(e.target.closest?.('#draw'))event('suji','CARD SHOPPING','Another card joins the collection.','draw','🃏');
    if(e.target.closest?.('#uno'))event('misti','UNO!','One-card pressure is officially active.','uno','🚨');
    if(e.target.closest?.('#rematch'))event('suji','RUN IT BACK','Suji already approved the rematch.','rematch','🔥');
  },true);
  document.addEventListener('input',e=>{if(e.target.matches?.('#gate-name,#name'))talk('entry','misti');if(e.target.matches?.('#code'))talk('join','suji')});

  function inspectText(text=''){
    const t=String(text).toLowerCase();if(!t)return;
    if(t.includes('+4')||t.includes('draw four')){talk('draw4');event('suji','+4 DETECTED','Diplomacy has failed.','draw4','+4')}
    else if(t.includes('+2')||t.includes('draw two')){talk('draw2');event('suji','+2 TAX','A small disaster arrived.','draw2','+2')}
    else if(t.includes('reverse')){talk('reverse');event('suji','REVERSE','Everybody turn around.','reverse','↩️')}
    else if(t.includes('skip')){talk('skip');event('misti','SKIPPED','Turn denied by the table.','skip','⏭️')}
    else if(t.includes('wild')){talk('wild');event('misti','COLOR CONTROL','The table changed shape.','wild','🌈')}
    else if(t.includes('winner')||t.includes('wins')||t.includes('you win')){talk('win');event('misti','VICTORY','Misti awards the crown. Suji claims credit.','win','👑')}
    else if(t.includes('disconnect')||t.includes('error')||t.includes('failed')){talk('error');event('misti','CONNECTION TROUBLE','Both cats are guarding your seat.','error','📡')}
    else if(t.includes('power')||t.includes('magnet')||t.includes('shield')||t.includes('robbery')||t.includes('freeze')){talk('power');event('suji','POWER CARD','Things are becoming unnecessarily dramatic.','power','⚡')}
  }
  ['toast','commentary-text','turn','winner','result-reason','disconnect','troll-banner','devil-flash','classic-power-status'].forEach(id=>{const el=document.getElementById(id);if(el)new MutationObserver(()=>inspectText(el.textContent)).observe(el,{childList:true,subtree:true,characterData:true})});
  if(window.DBT_CLASSIC_SOCKET?.on){let lastTurn='';window.DBT_CLASSIC_SOCKET.on('s_sync_state',state=>{if(!state||state.status!=='PLAYING')return;const current=(state.players||[]).find(p=>p.isCurrent);const key=`${state.round||0}:${current?.displayName||''}:${current?.seat??''}`;if(current&&key!==lastTurn){lastTurn=key;setExpression('misti','focused');setExpression('suji','curious');setTimeout(()=>{setExpression('misti','normal');setExpression('suji','normal')},1800)}const me=(state.players||[]).find(p=>p.isMe);if(me?.handCount===1)talk('uno')});window.DBT_CLASSIC_SOCKET.on('s_power_notice',d=>inspectText(d?.message));window.DBT_CLASSIC_SOCKET.on('disconnect',()=>talk('error'))}

  let idleTimer;const resetIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>{talk('idle');setExpression('misti','sleepy');setExpression('suji','sleepy')},30000)};['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,resetIdle,{passive:true}));resetIdle();
  decorate();new MutationObserver(decorate).observe(document.documentElement,{childList:true,subtree:true});talk(location.pathname.startsWith('/flex/')?'flex':'home');
})();