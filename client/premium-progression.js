(() => {
  if (window.DBT_PROGRESSION_V1) return;
  window.DBT_PROGRESSION_V1 = true;

  const stable = window.DBT_STABILITY;
  const ui = window.DBT_UI || { emit:()=>{}, haptic:()=>{} };
  const mode = (location.pathname.startsWith('/flex') || new URLSearchParams(location.search).get('mode') === 'flex') ? 'flex' : 'classic';
  const STORE_KEY = 'dbt-progression-v1';
  const safe = (name, fn) => {
    try { return fn(); }
    catch (error) { stable?.record?.(`progression:${name}`, error); return undefined; }
  };

  const defaultStore = () => ({
    version:1, xp:0, level:1, matches:0, wins:0, rounds:0,
    cardsPlayed:0, cardsDrawn:0, specialMoves:0, unoCalls:0, catches:0, draw4s:0,
    currentWinStreak:0, bestWinStreak:0, comebackWins:0, revengeMoments:0,
    achievements:{}, processed:[],
    daily:{date:'',progress:{},rewarded:{}},
    cosmetics:{cardback:'classic',table:'midnight',nameplate:'cyan'}
  });

  function loadStore(){
    try {
      const raw=localStorage.getItem(STORE_KEY); const parsed=raw?JSON.parse(raw):null;
      return parsed && parsed.version===1 ? { ...defaultStore(), ...parsed, daily:{...defaultStore().daily,...(parsed.daily||{})}, cosmetics:{...defaultStore().cosmetics,...(parsed.cosmetics||{})} } : defaultStore();
    } catch { return defaultStore(); }
  }

  const store = loadStore();
  const session = { room:'', plays:0, draws:0, specials:0, uno:0, catches:0, draw4s:0, comeback:false, revenge:false, peakHand:0, lowHand:99, events:0 };
  let classicBound=false, flexBound=false, flexActionObserver=null, flexStatusObserver=null, socialSeen=new Set(), lastClassicEvent='', lastFlexAction='', lastFlexResult='';

  const ACHIEVEMENTS = [
    {id:'first-win',icon:'🏆',name:'First Crown',desc:'Win your first recorded round.',test:s=>s.wins>=1},
    {id:'ten-wins',icon:'👑',name:'Table Regular',desc:'Reach 10 recorded wins.',test:s=>s.wins>=10},
    {id:'hundred-plays',icon:'🃏',name:'Card Machine',desc:'Play 100 cards.',test:s=>s.cardsPlayed>=100},
    {id:'uno-five',icon:'🚨',name:'UNO Caller',desc:'Call UNO five times.',test:s=>s.unoCalls>=5},
    {id:'catch-three',icon:'👀',name:'UNO Inspector',desc:'Catch three UNO mistakes.',test:s=>s.catches>=3},
    {id:'draw4-ten',icon:'+4',name:'Heavy Hitter',desc:'Play ten Draw Fours.',test:s=>s.draw4s>=10},
    {id:'streak-three',icon:'🔥',name:'Hot Table',desc:'Build a three-win streak.',test:s=>s.bestWinStreak>=3},
    {id:'comeback',icon:'📈',name:'Comeback Kid',desc:'Win after a comeback moment.',test:s=>s.comebackWins>=1},
    {id:'revenge-three',icon:'😈',name:'Revenge Tour',desc:'Record three revenge moments.',test:s=>s.revengeMoments>=3}
  ];

  const CHALLENGE_POOL = [
    {id:'cards',icon:'🃏',name:'Table Time',desc:'Play 8 cards today.',goal:8},
    {id:'uno',icon:'🚨',name:'Say It Loud',desc:'Call UNO once today.',goal:1},
    {id:'special',icon:'⚡',name:'Specialist',desc:'Play 3 special cards today.',goal:3},
    {id:'draw4',icon:'+4',name:'Pressure Play',desc:'Play one Draw Four today.',goal:1},
    {id:'catch',icon:'👀',name:'Sharp Eyes',desc:'Catch one UNO mistake today.',goal:1},
    {id:'wins',icon:'🏆',name:'Daily Crown',desc:'Win one recorded round today.',goal:1}
  ];

  const COSMETICS = [
    {category:'table',value:'midnight',name:'Midnight Table',desc:'Default premium dark table.',level:1,swatch:'midnight'},
    {category:'table',value:'aurora',name:'Aurora Table',desc:'Cool cyan-violet atmosphere.',level:3,swatch:'aurora'},
    {category:'table',value:'felt',name:'Tournament Felt',desc:'Subtle green tournament surface.',level:5,swatch:'felt'},
    {category:'cardback',value:'classic',name:'DBT Classic Back',desc:'Original DBT card-back treatment.',level:1,swatch:'classic'},
    {category:'cardback',value:'neon',name:'Neon Back',desc:'Electric arcade card back.',level:2,swatch:'neon'},
    {category:'cardback',value:'obsidian',name:'Obsidian Back',desc:'Low-key black-metal card back.',level:6,swatch:'obsidian'},
    {category:'nameplate',value:'cyan',name:'Cyan Nameplate',desc:'Clean DBT cyan identity.',level:1,swatch:'cyan'},
    {category:'nameplate',value:'gold',name:'Gold Nameplate',desc:'Warm champion highlight.',level:4,swatch:'gold'},
    {category:'nameplate',value:'ice',name:'Ice Nameplate',desc:'Cold final-card glow.',level:7,swatch:'ice'}
  ];

  const dayKey = () => new Date().toLocaleDateString('en-CA');
  const levelFor = xp => Math.max(1,Math.floor(Math.max(0,xp)/250)+1);
  const persist = () => safe('persist',()=>localStorage.setItem(STORE_KEY,JSON.stringify(store)));

  function normalizeDaily(){
    const today=dayKey();
    if(store.daily.date!==today) store.daily={date:today,progress:{},rewarded:{}};
  }

  function dailyChoices(){
    normalizeDaily();
    const seed=[...store.daily.date].reduce((n,c)=>n+c.charCodeAt(0),0);
    const picks=[];
    for(let i=0;i<CHALLENGE_POOL.length&&picks.length<3;i++){
      const item=CHALLENGE_POOL[(seed+i*2)%CHALLENGE_POOL.length];
      if(!picks.some(x=>x.id===item.id))picks.push(item);
    }
    for(const item of CHALLENGE_POOL)if(picks.length<3&&!picks.some(x=>x.id===item.id))picks.push(item);
    return picks;
  }

  function toastAchievement(text){
    safe('achievement-toast',()=>{
      document.querySelector('.dbt-achievement-toast')?.remove();
      const el=document.createElement('div');el.className='dbt-achievement-toast';el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),3200);
    });
  }

  function recomputeLevel(){
    const prior=store.level||1; store.level=levelFor(store.xp);
    if(store.level>prior) toastAchievement(`LEVEL UP · DBT LEVEL ${store.level} ⚡`);
  }

  function grantXp(amount, reason=''){ if(!Number.isFinite(amount)||amount<=0)return; store.xp+=amount; recomputeLevel(); persist(); renderProfile(); renderChip(); if(reason)ui.emit?.('progressionxp',{amount,reason,level:store.level}); }

  function checkAchievements(){
    let unlocked=false;
    for(const a of ACHIEVEMENTS){
      if(store.achievements[a.id]||!a.test(store))continue;
      store.achievements[a.id]=Date.now(); store.xp+=35; unlocked=true; toastAchievement(`${a.icon} ACHIEVEMENT · ${a.name} · +35 XP`);
    }
    if(unlocked){recomputeLevel();persist();renderProfile();renderChip()}
  }

  function addDaily(id,amount=1){
    normalizeDaily(); const chosen=dailyChoices(); if(!chosen.some(x=>x.id===id))return;
    const item=chosen.find(x=>x.id===id); store.daily.progress[id]=(store.daily.progress[id]||0)+amount;
    if(!store.daily.rewarded[id]&&store.daily.progress[id]>=item.goal){store.daily.rewarded[id]=true;store.xp+=60;recomputeLevel();toastAchievement(`${item.icon} DAILY COMPLETE · ${item.name} · +60 XP`)}
    persist();renderProfile();renderChip();
  }

  function applyCosmetics(){
    const root=document.documentElement;
    for(const category of ['table','cardback','nameplate']){
      const selected=store.cosmetics[category]; const item=COSMETICS.find(x=>x.category===category&&x.value===selected);
      if(!item||store.level<item.level){const fallback=COSMETICS.find(x=>x.category===category&&x.level===1);store.cosmetics[category]=fallback.value}
      root.dataset[`dbt${category[0].toUpperCase()+category.slice(1)}`]=store.cosmetics[category];
    }
    root.dataset.dbtTable=store.cosmetics.table; root.dataset.dbtCardback=store.cosmetics.cardback; root.dataset.dbtNameplate=store.cosmetics.nameplate;
  }

  const host=document.createElement('div');host.className='dbt-progress-host';
  const chip=document.createElement('button');chip.id='dbt-progress-chip';chip.type='button';host.appendChild(chip);
  const dialog=document.createElement('dialog');dialog.id='dbt-profile-dialog';
  dialog.innerHTML='<div class="dbt-profile-head"><span class="mark">DBT</span><div class="dbt-profile-title"><small>DBT PROFILE</small><b>Progress, achievements & cosmetics</b></div><button class="dbt-profile-close" type="button">✕</button></div><div class="dbt-profile-body"></div>';
  document.body.appendChild(dialog);
  const profileBody=dialog.querySelector('.dbt-profile-body');
  dialog.querySelector('.dbt-profile-close').onclick=()=>dialog.close(); chip.onclick=()=>{renderProfile();if(!dialog.open)dialog.showModal()};

  const flexResults=document.createElement('dialog');flexResults.id='dbt-flex-results';flexResults.innerHTML='<div class="dbt-flex-result-hero"><div class="cup">🏆</div><h2>Flex match complete</h2><p></p></div><div class="dbt-flex-result-body"><div class="dbt-story-panel"></div><div class="dbt-flex-result-actions"><button data-profile type="button">VIEW DBT PROFILE</button><button data-close type="button">CLOSE</button></div></div>';document.body.appendChild(flexResults);
  flexResults.querySelector('[data-close]').onclick=()=>flexResults.close(); flexResults.querySelector('[data-profile]').onclick=()=>{flexResults.close();renderProfile();dialog.showModal()};

  function mountChip(){
    const social=document.getElementById('dbt-social-live');
    const anchor=social||(mode==='flex'?(document.getElementById('status')||document.getElementById('action-log')):(document.querySelector('.commentary')||document.getElementById('hint')));
    if(anchor&&host.parentNode!==anchor.parentNode)anchor.insertAdjacentElement('afterend',host);
  }

  function renderChip(){chip.innerHTML=`<span class="lvl">LV ${store.level}</span><span>DBT PROFILE</span><span class="xp">${store.xp} XP</span>`}

  function renderProfile(){
    if(!profileBody)return; normalizeDaily();applyCosmetics();
    const levelBase=(store.level-1)*250, progress=Math.max(0,Math.min(100,((store.xp-levelBase)/250)*100));
    profileBody.replaceChildren();
    const level=document.createElement('section');level.className='dbt-level-card';level.innerHTML=`<div class="dbt-level-row"><strong>LEVEL ${store.level}</strong><span>${store.xp} total XP</span></div><div class="dbt-xp-track"><div class="dbt-xp-fill" style="width:${progress}%"></div></div><div class="dbt-xp-note">${250-(store.xp-levelBase)} XP to the next level · progress is stored on this device.</div>`;profileBody.appendChild(level);
    const stats=document.createElement('div');stats.className='dbt-stat-grid';
    const items=[['🏆',store.wins,'Wins'],['🔥',store.bestWinStreak,'Best streak'],['🃏',store.cardsPlayed,'Cards played'],['🎴',store.cardsDrawn,'Cards drawn'],['🚨',store.unoCalls,'UNO calls'],['👀',store.catches,'UNO catches'],['⚡',store.specialMoves,'Special moves'],['📈',store.comebackWins,'Comeback wins']];
    for(const [ico,val,label] of items){const x=document.createElement('div');x.className='dbt-stat';x.innerHTML=`<b>${ico} ${val}</b><span>${label}</span>`;stats.appendChild(x)}profileBody.appendChild(stats);

    const ach=document.createElement('section');ach.className='dbt-section';ach.innerHTML='<div class="dbt-section-head"><b>Achievements</b><small>+35 XP each</small></div>';const ag=document.createElement('div');ag.className='dbt-achievements';
    for(const a of ACHIEVEMENTS){const unlocked=!!store.achievements[a.id];const el=document.createElement('div');el.className=`dbt-achievement ${unlocked?'unlocked':'locked'}`;el.innerHTML=`<span class="ico">${a.icon}</span><b>${a.name}</b><span>${a.desc}</span>`;ag.appendChild(el)}ach.appendChild(ag);profileBody.appendChild(ach);

    const daily=document.createElement('section');daily.className='dbt-section';daily.innerHTML='<div class="dbt-section-head"><b>Daily challenges</b><small>Refreshes each day · +60 XP</small></div>';const dg=document.createElement('div');dg.className='dbt-challenges';
    for(const c of dailyChoices()){const value=Math.min(c.goal,store.daily.progress[c.id]||0),done=!!store.daily.rewarded[c.id];const el=document.createElement('div');el.className=`dbt-challenge ${done?'done':''}`;el.innerHTML=`<span class="ico">${c.icon}</span><b>${c.name}</b><span>${c.desc}</span><span>${value} / ${c.goal}${done?' · COMPLETE':''}</span><div class="dbt-challenge-progress"><i style="width:${Math.min(100,(value/c.goal)*100)}%"></i></div>`;dg.appendChild(el)}daily.appendChild(dg);profileBody.appendChild(daily);

    const cos=document.createElement('section');cos.className='dbt-section';cos.innerHTML='<div class="dbt-section-head"><b>Cosmetics foundation</b><small>Visual only · no gameplay advantage</small></div>';const cg=document.createElement('div');cg.className='dbt-cosmetics';
    for(const c of COSMETICS){const unlocked=store.level>=c.level,selected=store.cosmetics[c.category]===c.value;const el=document.createElement('div');el.className=`dbt-cosmetic ${unlocked?'':'locked'} ${selected?'selected':''}`;el.innerHTML=`<div class="dbt-cosmetic-swatch dbt-swatch-${c.swatch}"></div><b>${c.name}</b><span>${c.desc}</span><span>${unlocked?`Unlocked · Level ${c.level}`:`Unlocks at Level ${c.level}`}</span><button type="button" ${unlocked?'':'disabled'}>${selected?'EQUIPPED':'EQUIP'}</button>`;el.querySelector('button').onclick=()=>{if(!unlocked)return;store.cosmetics[c.category]=c.value;persist();applyCosmetics();renderProfile()};cg.appendChild(el)}cos.appendChild(cg);profileBody.appendChild(cos);
  }

  function winBurst(label){
    safe('win-burst',()=>{if(ui.reducedMotion)return;document.querySelector('.dbt-win-burst')?.remove();const layer=document.createElement('div');layer.className='dbt-win-burst';const ring=document.createElement('span');ring.className='ring';const text=document.createElement('b');text.textContent=label||'ROUND OVER';layer.append(ring,text);for(let i=0;i<(ui.lowPower?10:24);i++){const p=document.createElement('i');p.className='dbt-win-confetti';p.style.setProperty('--a',`${i*(360/(ui.lowPower?10:24))}deg`);layer.appendChild(p)}document.body.appendChild(layer);setTimeout(()=>layer.remove(),1900)});
  }

  function storyHtml(winner,didWin){
    const line=didWin ? (session.comeback?'Comeback secured — you recovered and closed the round.':'You closed the round with the final card.') : (session.plays>=6?'You stayed active throughout the round.':'Short, sharp round — the table moved fast.');
    return `<div class="kicker">MATCH STORY</div><div class="dbt-story-title">${winner?`${winner} takes the round`:'Round complete'}</div><div class="dbt-story-grid"><div class="dbt-story-cell"><b>${session.plays}</b><span>Your cards played</span></div><div class="dbt-story-cell"><b>${session.draws}</b><span>Your deck visits</span></div><div class="dbt-story-cell"><b>${session.specials}</b><span>Your special moves</span></div><div class="dbt-story-cell"><b>${session.uno}</b><span>Your UNO calls</span></div><div class="dbt-story-cell"><b>${session.catches}</b><span>Your UNO catches</span></div><div class="dbt-story-cell"><b>${session.revenge?'YES':'—'}</b><span>Revenge moment</span></div></div><div class="dbt-story-line">${line}</div><div class="dbt-story-actions"><button type="button" data-dbt-open-profile>VIEW PROFILE · LV ${store.level}</button></div>`;
  }

  function resetSession(room){session.room=room||'';session.plays=0;session.draws=0;session.specials=0;session.uno=0;session.catches=0;session.draw4s=0;session.comeback=false;session.revenge=false;session.peakHand=0;session.lowHand=99;session.events=0}
  function currentRoom(){try{const raw=localStorage.getItem(mode==='flex'?'flex-session':'uno-session');const s=raw?JSON.parse(raw):null;return String(s?.roomCode||'').toUpperCase()}catch{return ''}}
  function ensureSessionRoom(){const room=currentRoom();if(room&&room!==session.room)resetSession(room);return room}
  function myClassicName(s){return String(s?.myName||s?.players?.find?.(p=>p.isMe)?.displayName||'').trim()}

  function trackClassicEvent(ev,s){
    if(!ev?.id||ev.id===lastClassicEvent)return;lastClassicEvent=ev.id;session.events++;
    const me=myClassicName(s),actor=String(ev.actor||'').trim(),type=String(ev.type||'').toLowerCase(); if(!me||actor!==me)return;
    const playTypes=new Set(['play','draw2','draw4','skip','reverse','wild','devil','color']);
    const specials=new Set(['draw2','draw4','skip','reverse','wild','devil']);
    if(playTypes.has(type)){session.plays++;store.cardsPlayed++;grantXp(3,'card-play');addDaily('cards',1)}
    if(specials.has(type)){session.specials++;store.specialMoves++;grantXp(2,'special-card');addDaily('special',1)}
    if(type==='draw'){session.draws++;store.cardsDrawn++;grantXp(1,'draw')}
    if(type==='draw4'){session.draw4s++;store.draw4s++;addDaily('draw4',1)}
    if(type==='uno'&&ev.value!=='missed'){session.uno++;store.unoCalls++;grantXp(7,'uno');addDaily('uno',1)}
    if(type==='catch'){session.catches++;store.catches++;grantXp(10,'uno-catch');addDaily('catch',1)}
    checkAchievements();persist();
  }

  function processed(key){return store.processed.includes(key)}
  function markProcessed(key){store.processed.push(key);if(store.processed.length>60)store.processed.splice(0,store.processed.length-60)}

  function finishResult(key,winner,didWin,storyTarget){
    if(!key||processed(key))return false;markProcessed(key);store.matches++;store.rounds++;
    if(didWin){store.wins++;store.currentWinStreak++;store.bestWinStreak=Math.max(store.bestWinStreak,store.currentWinStreak);if(session.comeback)store.comebackWins++;store.xp+=55;addDaily('wins',1)}else store.currentWinStreak=0;
    recomputeLevel();checkAchievements();persist();renderChip();renderProfile();winBurst(winner?`${winner} WINS`:'ROUND OVER');
    if(storyTarget){storyTarget.innerHTML=storyHtml(winner,didWin);storyTarget.querySelector('[data-dbt-open-profile]')?.addEventListener('click',()=>{renderProfile();if(!dialog.open)dialog.showModal()})}
    ui.emit?.('progressionresult',{winner,didWin,room:session.room,level:store.level,xp:store.xp});return true;
  }

  function handleClassicState(s){
    safe('classic-state',()=>{const room=ensureSessionRoom();mountChip();if(Array.isArray(s?.myHand)){session.peakHand=Math.max(session.peakHand,s.myHand.length);session.lowHand=Math.min(session.lowHand,s.myHand.length)}trackClassicEvent(s?.lastEvent,s);if(s?.status!=='ROUND_OVER')return;const winner=String(s.winnerName||'Player'),me=myClassicName(s),key=`classic:${room}:${s.round||0}:${winner}`;const results=document.getElementById('results');if(!results)return;let panel=results.querySelector('.dbt-story-panel');if(!panel){panel=document.createElement('section');panel.className='dbt-story-panel';const rematch=document.getElementById('rematch');if(rematch?.parentNode===results)results.insertBefore(panel,rematch);else results.appendChild(panel)}finishResult(key,winner,winner===me,panel)});
  }

  function bindClassic(){if(classicBound)return true;const socket=window.DBT_CLASSIC_SOCKET;if(!socket?.on)return false;classicBound=true;socket.on('s_sync_state',handleClassicState);return true}

  function flexNames(){return [...document.querySelectorAll('#players .player')].map(el=>String(el.querySelector('b')?.textContent||'').trim()).filter(Boolean)}
  function flexMe(){const txt=String(document.getElementById('me-name')?.textContent||'').trim();return flexNames().sort((a,b)=>b.length-a.length).find(n=>txt.endsWith(n)||txt.includes(n))||txt.replace(/^\S+\s+/,'')}
  function inferFlexActor(text){return flexNames().sort((a,b)=>b.length-a.length).find(n=>text.startsWith(`${n} `)||text.startsWith(`${n}:`)||text===n)||''}

  function trackFlexAction(textValue){
    const text=String(textValue||'').trim();if(!text||text===lastFlexAction)return;lastFlexAction=text;session.events++;const me=flexMe(),actor=inferFlexActor(text);if(!me||actor!==me)return;const u=text.toUpperCase();
    const isDraw=/একটি কার্ড তুলেছে|DRAW/.test(text);const isUno=/UNO/.test(u);const isCatch=/CATCH|catch|ধর/.test(text);const isSpecial=/\+4|\+2|SKIP|REVERSE|WILD|FLEX|CHALLENGE/i.test(text);const isPlay=/খেল|PLAY/i.test(text)||isSpecial;
    if(isPlay&&!isDraw){session.plays++;store.cardsPlayed++;grantXp(3,'flex-play');addDaily('cards',1)}
    if(isDraw){session.draws++;store.cardsDrawn++;grantXp(1,'flex-draw')}
    if(isSpecial){session.specials++;store.specialMoves++;grantXp(2,'flex-special');addDaily('special',1)}
    if(/\+4/.test(text)){session.draw4s++;store.draw4s++;addDaily('draw4',1)}
    if(isUno&&!/CATCH|catch/.test(text)){session.uno++;store.unoCalls++;grantXp(7,'flex-uno');addDaily('uno',1)}
    if(isCatch){session.catches++;store.catches++;grantXp(10,'flex-catch');addDaily('catch',1)}
    checkAchievements();persist();
  }

  function handleFlexStatus(){
    safe('flex-status',()=>{ensureSessionRoom();mountChip();const status=String(document.getElementById('status')?.textContent||'').trim();const m=status.match(/^(.+?)\s+WINS\b/i);if(!m)return;const winner=m[1].trim();const room=currentRoom();const key=`flex:${room}:${winner}:${lastFlexAction}`;if(key===lastFlexResult||processed(key))return;lastFlexResult=key;const me=flexMe();const story=flexResults.querySelector('.dbt-story-panel');if(!finishResult(key,winner,winner===me,story))return;flexResults.querySelector('.dbt-flex-result-hero p').textContent=winner===me?'Victory recorded in your DBT profile.':`${winner} closed the Flex match.`;if(!flexResults.open)flexResults.showModal()});
  }

  function bindFlex(){
    if(flexBound)return true;const log=document.getElementById('action-log'),status=document.getElementById('status');if(!log||!status)return false;flexBound=true;
    flexActionObserver=new MutationObserver(()=>safe('flex-action',()=>{ensureSessionRoom();trackFlexAction(log.textContent);mountChip()}));flexActionObserver.observe(log,{childList:true,subtree:true,characterData:true});
    flexStatusObserver=new MutationObserver(handleFlexStatus);flexStatusObserver.observe(status,{childList:true,subtree:true,characterData:true});trackFlexAction(log.textContent);handleFlexStatus();return true;
  }

  function handleSocialMoment(event){
    safe('social-moment',()=>{const d=event?.detail||{};const title=String(d.title||'');if(!title)return;const key=`${title}|${String(d.detail||d.sub||'')}`;if(socialSeen.has(key))return;socialSeen.add(key);if(socialSeen.size>40)socialSeen=new Set([...socialSeen].slice(-25));const me=mode==='flex'?flexMe():String(document.getElementById('my-name')?.textContent||'').trim();if(me&&title.includes(me)&&/comeback/i.test(title))session.comeback=true;if(me&&title.includes(me)&&/revenge/i.test(title)){session.revenge=true;store.revengeMoments++;persist();checkAchievements()}});
  }
  ui.bus?.addEventListener?.('socialmoment',handleSocialMoment);

  function boot(){
    safe('boot',()=>{normalizeDaily();recomputeLevel();applyCosmetics();renderChip();renderProfile();mountChip();const bind=()=>{const ok=mode==='classic'?bindClassic():bindFlex();if(!ok)setTimeout(bind,300)};bind();const bodyObs=new MutationObserver(()=>{mountChip();if(mode==='flex'&&!flexBound)bindFlex();if(mode==='classic'&&!classicBound)bindClassic()});bodyObs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});setInterval(()=>safe('heartbeat',()=>{mountChip();ensureSessionRoom();if(mode==='flex')handleFlexStatus()}),1800);persist()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.DBT_PROGRESSION={open:()=>{renderProfile();if(!dialog.open)dialog.showModal()},store,get level(){return store.level},get xp(){return store.xp}};
})();
