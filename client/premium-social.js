(() => {
  if (window.DBT_SOCIAL_V2) return;
  window.DBT_SOCIAL_V2 = true;

  const stable = window.DBT_STABILITY;
  const ui = window.DBT_UI || { emit:()=>{}, haptic:()=>{} };
  const mode = (location.pathname.startsWith('/flex') || new URLSearchParams(location.search).get('mode') === 'flex') ? 'flex' : 'classic';
  const safe = (name, fn) => {
    try { return fn(); }
    catch (error) { stable?.record?.(`social:${name}`, error); return undefined; }
  };

  const history = [];
  const stats = new Map();
  const attacks = new Map();
  let previousCounts = new Map();
  let currentRoom = '';
  let lastEventId = '';
  let lastFlexAction = '';
  let lastActor = '';
  let actorStreak = 0;
  let lastAttack = null;
  let lastLeader = '';
  let seq = 0;
  let disposed = false;
  let flexActionObserver = null;
  let flexPlayerObserver = null;
  let bodyObserver = null;
  let classicBound = false;

  const roomSession = () => safe('room-session', () => {
    const raw = localStorage.getItem(mode === 'flex' ? 'flex-session' : 'uno-session');
    const s = raw ? JSON.parse(raw) : null;
    const roomCode = String(s?.roomCode || '').toUpperCase();
    const token = mode === 'flex' ? s?.token : s?.sessionToken;
    return token && /^[A-Z2-9]{4}$/.test(roomCode) ? { roomCode, token } : null;
  });

  const gameVisible = () => safe('game-visible', () => {
    const ids = mode === 'flex' ? ['lobby','game'] : ['lobby','board'];
    return ids.some(id => {
      const el = document.getElementById(id);
      return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
    });
  }) || false;

  const dock = document.createElement('aside');
  dock.id = 'dbt-social-live';
  dock.className = 'dbt-social-live';
  dock.hidden = true;
  dock.setAttribute('aria-live','polite');
  const head = document.createElement('div'); head.className='dbt-social-head';
  const dot = document.createElement('span'); dot.className='dbt-social-dot';
  const brand = document.createElement('span'); brand.className='dbt-social-brand'; brand.textContent='DBT LIVE';
  const meta = document.createElement('small'); meta.textContent='MATCH INTELLIGENCE';
  const histBtn = document.createElement('button'); histBtn.type='button'; histBtn.className='dbt-social-history-btn'; histBtn.textContent='HISTORY';
  head.append(dot,brand,meta,histBtn);
  const ticker = document.createElement('div'); ticker.className='dbt-social-ticker';
  const icon = document.createElement('span'); icon.className='dbt-social-icon'; icon.textContent='⚡';
  const copy = document.createElement('div'); copy.className='dbt-social-copy';
  const title = document.createElement('b'); title.textContent='Live moments are ready';
  const sub = document.createElement('span'); sub.textContent='Rivalries, streaks, comebacks and clutch plays will appear here.';
  copy.append(title,sub); ticker.append(icon,copy); dock.append(head,ticker);

  const dialog = document.createElement('dialog');
  dialog.id = 'dbt-social-history';
  const dialogHead = document.createElement('div'); dialogHead.className='dbt-social-dialog-head';
  const dialogTitle = document.createElement('div');
  const dialogSmall = document.createElement('small'); dialogSmall.textContent='DBT LIVE';
  const dialogBold = document.createElement('b'); dialogBold.textContent='Match action history';
  dialogTitle.append(dialogSmall,dialogBold);
  const close = document.createElement('button'); close.type='button'; close.className='dbt-social-close'; close.textContent='✕';
  dialogHead.append(dialogTitle,close);
  const historyList = document.createElement('div'); historyList.id='dbt-social-history-list';
  dialog.append(dialogHead,historyList);
  document.body.appendChild(dialog);

  function anchor(){
    return mode === 'flex' ? (document.getElementById('action-log') || document.getElementById('status')) : (document.querySelector('.commentary') || document.getElementById('hint'));
  }

  function mount(){
    if (disposed) return;
    const a = anchor();
    if (a && dock.parentNode !== a.parentNode) a.insertAdjacentElement('afterend',dock);
    dock.hidden = !roomSession() || !gameVisible();
  }

  function resetForRoom(){
    const room = roomSession()?.roomCode || '';
    if (!room || room === currentRoom) return;
    currentRoom = room;
    history.length = 0;
    stats.clear(); attacks.clear(); previousCounts = new Map();
    lastEventId=''; lastFlexAction=''; lastActor=''; actorStreak=0; lastAttack=null; lastLeader=''; seq=0;
    renderHistory();
  }

  function timeLabel(ts){
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  function renderHistory(){
    historyList.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('div'); empty.className='dbt-social-empty'; empty.textContent='Match moments will build here as the round unfolds.'; historyList.appendChild(empty); return;
    }
    for (const item of history) {
      const row=document.createElement('div'); row.className='dbt-social-history-row';
      const ico=document.createElement('span'); ico.className='ico'; ico.textContent=item.icon;
      const txt=document.createElement('span'); txt.className='txt';
      const b=document.createElement('b'); b.textContent=item.title;
      const detail=document.createElement('span'); detail.textContent=item.detail || 'Live match moment';
      const time=document.createElement('time'); time.textContent=timeLabel(item.at);
      txt.append(b,detail); row.append(ico,txt,time); historyList.appendChild(row);
    }
  }

  function addHistory(kind,iconValue,titleValue,detail='',tone='cyan'){
    history.unshift({ id:++seq, kind, icon:iconValue, title:titleValue, detail, tone, at:Date.now() });
    if (history.length > 60) history.length = 60;
    renderHistory();
  }

  function burst(emoji){
    if (!emoji) return;
    const el=document.createElement('span'); el.className='dbt-social-reaction'; el.textContent=emoji; dock.appendChild(el); setTimeout(()=>el.remove(),950);
  }

  function callout(iconValue,titleValue,detail='',tone='cyan',emoji=''){
    mount();
    if (dock.hidden) return;
    dock.dataset.tone=tone; icon.textContent=iconValue; title.textContent=titleValue; sub.textContent=detail || 'Live match moment';
    dock.classList.remove('dbt-social-pop'); void dock.offsetWidth; dock.classList.add('dbt-social-pop');
    setTimeout(()=>dock.classList.remove('dbt-social-pop'),520);
    burst(emoji); ui.emit?.('socialmoment',{icon:iconValue,title:titleValue,detail,tone});
  }

  function announce(kind,iconValue,titleValue,detail='',tone='cyan',emoji=''){
    addHistory(kind,iconValue,titleValue,detail,tone); callout(iconValue,titleValue,detail,tone,emoji);
  }

  function statFor(name,count){
    let s=stats.get(name);
    if(!s){s={peak:count,min:count,last:count,drawn:0,played:0,comeback:false,uno:false};stats.set(name,s)}
    if(Number.isFinite(count)){s.peak=Math.max(s.peak,count);s.min=Math.min(s.min,count);s.last=count}
    return s;
  }

  function noteActor(actor){
    actor=String(actor||'').trim(); if(!actor)return;
    if(actor===lastActor) actorStreak++; else {lastActor=actor;actorStreak=1}
    if(actorStreak===3) announce('streak','🔥',`${actor} is heating up`,'Three notable actions in a row.','gold','🔥');
    if(actorStreak===5) announce('streak','⚡',`${actor} is controlling the table`,'Five-event hot streak.','gold','⚡');
  }

  function attack(actor,target,kind){
    actor=String(actor||'').trim(); target=String(target||'').trim();
    if(!actor||!target||actor===target)return;
    const key=`${actor}→${target}`; const count=(attacks.get(key)||0)+1; attacks.set(key,count);
    if(lastAttack && lastAttack.actor===target && lastAttack.target===actor && seq-lastAttack.seq<=5) announce('revenge','😈',`${actor} got revenge on ${target}`,`${kind.toUpperCase()} answered a recent attack.`,'purple','💥');
    lastAttack={actor,target,kind,seq};
    if(count===3) announce('rivalry','⚔️',`${actor} vs ${target} is now a rivalry`,`Three direct attacks from ${actor} to ${target}.`,'danger','⚔️');
  }

  function detectCounts(players){
    if(!Array.isArray(players)||!players.length)return;
    const next=new Map(); let leader=''; let best=Infinity;
    for(const p of players){
      const name=String(p.name||p.displayName||'').trim(); const count=Number(p.count??p.cardCount);
      if(!name||!Number.isFinite(count))continue;
      next.set(name,count); const s=statFor(name,count); const prev=previousCounts.get(name);
      if(Number.isFinite(prev)){
        if(count>prev)s.drawn+=count-prev; if(count<prev)s.played+=prev-count;
        if(prev===2&&count===1&&!s.uno){s.uno=true;announce('clutch','🚨',`${name} is one card from victory`,s.peak>=6?`From ${s.peak} cards down to UNO range.`:'UNO pressure is live.','danger','🚨')}
        if(!s.comeback&&s.peak>=7&&count<=2&&s.peak-count>=5){s.comeback=true;announce('comeback','📈',`${name} mounted a huge comeback`,`${s.peak} cards earlier, now only ${count}.`,'gold','🔥')}
      }
      if(count<best){best=count;leader=name}
    }
    if(lastLeader&&leader&&leader!==lastLeader&&best<=3)addHistory('lead','👑',`${leader} took the card-count lead`,`Fewest cards at the table: ${best}.`,'gold');
    if(leader)lastLeader=leader; previousCounts=next;
  }

  function handleClassicEvent(ev){
    if(!ev||!ev.id||ev.id===lastEventId)return; lastEventId=ev.id;
    const actor=String(ev.actor||'').trim(), target=String(ev.target||'').trim(), type=String(ev.type||'').toLowerCase(); noteActor(actor);
    const labels={play:['🃏','Card played'],draw:['🎴','Draw'],draw2:['+2','Draw Two'],draw4:['+4','Draw Four'],skip:['⏭️','Skip'],reverse:['↻','Reverse'],wild:['🌈','Wild'],color:['🎨','Color chosen'],uno:['🚨','UNO'],catch:['👀','UNO caught'],pass:['⏭','Pass'],timeout:['⏱️','Timeout'],win:['🏆','Victory'],devil:['😈','Devil reveal'],taunt:['😂','Reaction']};
    const [ico,label]=labels[type]||['⚡',type||'Action'];
    let detail=target?`${actor} → ${target}`:actor||''; if(ev.value!=null&&typeof ev.value!=='object')detail += `${detail?' · ':''}${String(ev.value)}`;
    addHistory(type,ico,actor?`${actor}: ${label}`:label,detail);
    if(['draw2','draw4','skip','catch'].includes(type)&&actor&&target)attack(actor,target,type);
    if(type==='draw4')callout('+4',`${actor||'Someone'} dropped a Draw Four`,target?`${target} is under pressure.`:'Heavy attack at the table.','danger','💥');
    else if(type==='catch')callout('👀',`${actor||'Someone'} caught ${target||'an UNO mistake'}`,'Clutch awareness.','gold','👀');
    else if(type==='win')announce('win','🏆',`${actor||'Player'} wins the round`,'Match story locked in.','gold','🏆');
    else if(type==='uno'&&ev.value!=='missed')callout('🚨',`${actor||'Player'} called UNO`,'One-card pressure is live.','danger','🚨');
    else if(type==='devil')callout('😈',`${actor||'Player'} revealed the table`,'Information advantage for one second.','purple','😈');
  }

  function bindClassic(){
    if(classicBound)return true;
    const socket=window.DBT_CLASSIC_SOCKET; if(!socket?.on)return false;
    classicBound=true;
    socket.on('s_sync_state', s=>safe('classic-sync',()=>{resetForRoom();mount();detectCounts((s?.players||[]).map(p=>({name:p.displayName,count:p.cardCount})));handleClassicEvent(s?.lastEvent)}));
    socket.on('s_power_notice', d=>safe('classic-power',()=>{const text=String(d?.message||'').trim();if(!text)return;const upper=text.toUpperCase();let ico='⚡',tone='cyan';if(upper.includes('ROBBERY')){ico='🥷';tone='purple'}else if(upper.includes('SHIELD'))ico='🛡️';else if(upper.includes('FREEZE'))ico='❄️';else if(upper.includes('MAGNET'))ico='🧲';const blocked=/BLOCK|BLOCKED/i.test(text);announce('power',ico,blocked?'Power blocked':`${ico} DBT Power move`,text,blocked?'gold':tone,ico)}));
    return true;
  }

  function flexPlayers(){
    return [...document.querySelectorAll('#players .player')].map(el=>{
      const b=el.querySelector('b'); const small=el.querySelector('small'); const m=String(small?.textContent||'').match(/(\d+)\s*cards/i);
      return {name:String(b?.textContent||'').trim(),count:m?Number(m[1]):NaN};
    }).filter(x=>x.name&&Number.isFinite(x.count));
  }

  function handleFlexAction(textValue){
    const text=String(textValue||'').trim(); if(!text||text===lastFlexAction)return; lastFlexAction=text;
    const names=flexPlayers().map(x=>x.name).sort((a,b)=>b.length-a.length); const actor=names.find(n=>text.startsWith(`${n} `)||text.startsWith(`${n}:`)||text===n)||''; noteActor(actor);
    const u=text.toUpperCase(); let ico='⚡',kind='action',tone='cyan';
    if(u.includes('CHALLENGE')){ico='⚔️';kind='challenge';tone='danger'}else if(u.includes('+4')){ico='+4';kind='draw4';tone='danger'}else if(u.includes('+2')){ico='+2';kind='draw2';tone='danger'}else if(u.includes('SKIP')){ico='⏭️';kind='skip';tone='gold'}else if(u.includes('REVERSE')){ico='↻';kind='reverse'}else if(u.includes('WILD')){ico='🌈';kind='wild';tone='purple'}else if(u.includes('জিতে')||u.includes('WINS')){ico='🏆';kind='win';tone='gold'}else if(u.includes('FLEX')){ico='⚡';kind='flex';tone='gold'}
    addHistory(kind,ico,text,actor?`Actor: ${actor}`:'',tone);
    if(kind==='draw4'||kind==='challenge')callout(ico,text,'High-pressure Flex moment.',tone,'💥'); else if(kind==='win')announce('win','🏆',text,'Flex match story complete.','gold','🏆'); else if(kind==='flex')callout('⚡',text,'Power-side momentum shift.','gold','⚡');
  }

  function bindFlex(){
    const log=document.getElementById('action-log'), players=document.getElementById('players'); if(!log||!players)return false;
    if(!flexActionObserver){flexActionObserver=new MutationObserver(()=>safe('flex-action',()=>{resetForRoom();mount();handleFlexAction(log.textContent)}));flexActionObserver.observe(log,{childList:true,subtree:true,characterData:true})}
    if(!flexPlayerObserver){flexPlayerObserver=new MutationObserver(()=>safe('flex-players',()=>{resetForRoom();mount();detectCounts(flexPlayers())}));flexPlayerObserver.observe(players,{childList:true,subtree:true,characterData:true})}
    detectCounts(flexPlayers()); handleFlexAction(log.textContent); return true;
  }

  function refreshRivalryBadges(){
    document.querySelectorAll('.dbt-rivalry-badge').forEach(x=>x.remove());
    for(const [key,count] of attacks){
      if(count<3)continue; const target=key.split('→')[1];
      for(const el of document.querySelectorAll('.opponent-label,.player-row,#players .player')){
        if(el.textContent?.includes(target)){const badge=document.createElement('span');badge.className='dbt-rivalry-badge';badge.textContent='⚔ RIVAL';el.appendChild(badge)}
      }
    }
  }

  function tick(){
    if(disposed)return; safe('tick',()=>{mount();resetForRoom();if(mode==='classic')bindClassic();else bindFlex();refreshRivalryBadges()});
  }

  histBtn.onclick=()=>safe('open-history',()=>{renderHistory();if(!dialog.open)dialog.showModal()});
  close.onclick=()=>dialog.close();
  dialog.addEventListener('cancel',()=>{});
  bodyObserver=new MutationObserver(()=>safe('body-observer',()=>mount())); bodyObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
  const timer=setInterval(tick,1200); tick();

  function dispose(){
    if(disposed)return; disposed=true; clearInterval(timer); flexActionObserver?.disconnect(); flexPlayerObserver?.disconnect(); bodyObserver?.disconnect(); dock.remove(); if(dialog.open)dialog.close(); dialog.remove();
  }
  window.addEventListener('pagehide',dispose,{once:true});
  window.DBT_SOCIAL_V2={history,stats,attacks,dispose};
})();
