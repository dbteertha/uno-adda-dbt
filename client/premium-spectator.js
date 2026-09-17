(() => {
  if (window.DBT_SPECTATOR_V1 || location.pathname.startsWith('/flex')) return;
  window.DBT_SPECTATOR_V1 = true;
  const stable = window.DBT_STABILITY;
  const safe = (name, fn) => { try { return fn(); } catch (error) { stable?.record?.(`spectator:${name}`, error); return undefined; } };
  const params = new URLSearchParams(location.search);
  const initialRoom = String(params.get('watch') || '').toUpperCase();
  const initialKey = String(params.get('watchKey') || '');
  let roomCode = '';
  let key = '';
  let socket = null;
  let current = null;
  const eventIds = new Set();
  const events = [];

  function toast(text) {
    safe('toast', () => {
      document.querySelector('.dbt-watch-toast')?.remove();
      const el = document.createElement('div'); el.className='dbt-watch-toast'; el.textContent=text; document.body.appendChild(el); setTimeout(()=>el.remove(),2400);
    });
  }

  const shell = document.createElement('section');
  shell.className = 'dbt-spectator-shell'; shell.hidden = true;
  shell.innerHTML = '<div class="dbt-spectator-top"><div class="dbt-spectator-brand"><small>DBT GAMES · PUBLIC MATCH VIEW</small><h2>WATCH MODE</h2></div><span class="dbt-live-pill"><i></i><span data-live>CONNECTING</span></span></div><div class="dbt-spectator-grid"><div class="dbt-watch-table"><div class="dbt-watch-meta"><div class="dbt-watch-stat"><small>ROOM</small><b data-room>----</b></div><div class="dbt-watch-stat"><small>ROUND</small><b data-round>0</b></div><div class="dbt-watch-stat"><small>STATUS</small><b data-status>—</b></div><div class="dbt-watch-stat"><small>DIRECTION</small><b data-direction>→</b></div></div><div class="dbt-watch-card" data-card data-color="WILD"><div><span data-card-value>—</span><small data-color>WAITING</small></div></div><div class="dbt-watch-players" data-players></div></div><aside class="dbt-watch-feed"><h3>PUBLIC MATCH TIMELINE</h3><div class="dbt-watch-events" data-events><div class="dbt-watch-empty">Public match events will appear here. Hidden cards are never sent to spectators.</div></div></aside></div><div class="dbt-spectator-actions"><button type="button" data-replay>EXPORT PUBLIC REPLAY</button><button type="button" data-copy>COPY WATCH LINK</button><button type="button" class="danger" data-exit>EXIT WATCH MODE</button></div>';
  document.body.appendChild(shell);
  const q = (s) => shell.querySelector(s);

  const labelEvent = (ev) => {
    const type=String(ev?.type||'event').toLowerCase();
    const labels={play:'Card played',draw:'Card drawn',draw2:'Draw Two',draw4:'Draw Four',skip:'Skip',reverse:'Reverse',wild:'Wild',color:'Color chosen',uno:'UNO',catch:'UNO caught',pass:'Pass',timeout:'Turn timeout',win:'Round won',devil:'Devil card',taunt:'Reaction'};
    const actor=String(ev?.actor||'Player'); const target=ev?.target?` → ${ev.target}`:''; const value=ev?.value?` · ${ev.value}`:'';
    return {title:`${actor}: ${labels[type]||type}${target}`,detail:`${new Date(ev?.at||Date.now()).toLocaleTimeString()}${value}`};
  };

  function addEvent(ev) {
    if (!ev?.id || eventIds.has(ev.id)) return;
    eventIds.add(ev.id); events.unshift(ev); if (events.length>80) events.length=80; renderEvents();
  }

  function renderEvents() {
    const box=q('[data-events]'); box.replaceChildren();
    if(!events.length){const e=document.createElement('div');e.className='dbt-watch-empty';e.textContent='Public match events will appear here. Hidden cards are never sent to spectators.';box.appendChild(e);return;}
    for(const ev of events){const row=document.createElement('div');row.className='dbt-watch-event';const t=labelEvent(ev);const b=document.createElement('b');b.textContent=t.title;const s=document.createElement('small');s.textContent=t.detail;row.append(b,s);box.appendChild(row)}
  }

  function render(state) {
    current=state; shell.hidden=false;
    q('[data-room]').textContent=state.roomCode||'----'; q('[data-round]').textContent=String(state.round||0); q('[data-status]').textContent=String(state.status||'—').replaceAll('_',' '); q('[data-direction]').textContent=state.direction===-1?'←':'→';
    const card=q('[data-card]'), top=state.topDiscardCard; card.dataset.color=top?.color||'WILD'; q('[data-card-value]').textContent=top?.value?.replaceAll('_',' ')||'—'; q('[data-color]').textContent=state.activeColor||'WAITING';
    const box=q('[data-players]'); box.replaceChildren();
    for(const p of state.players||[]){const row=document.createElement('div');row.className=`dbt-watch-player${p.isCurrent?' current':''}`;const av=document.createElement('span');av.className='av';av.textContent=p.avatar||'🎮';const copy=document.createElement('span');const b=document.createElement('b');b.textContent=p.displayName||'Player';const sm=document.createElement('small');sm.textContent=`${p.connected?'ONLINE':'OFFLINE'} · ${p.wins||0} wins · ${p.score||0} pts`;copy.append(b,sm);const count=document.createElement('strong');count.textContent=`${p.cardCount} 🃏`;row.append(av,copy,count);box.appendChild(row)}
    q('[data-live]').textContent=state.paused?'PAUSED':'LIVE'; addEvent(state.lastEvent);
  }

  function createSocket() {
    if(socket) return socket;
    if(typeof window.io!=='function') throw new Error('Realtime service unavailable');
    socket=window.io('/',{reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:700,reconnectionDelayMax:3500});
    socket.on('connect',()=>{if(roomCode&&key)socket.emit('c_spectate_room',{roomCode,watchKey:key})});
    socket.on('s_spectator_state',render);
    socket.on('s_spectator_error',({message}={})=>{toast(message||'Unable to watch this room.');q('[data-live]').textContent='ERROR'});
    socket.on('s_spectator_closed',({reason}={})=>{toast(reason==='room-ended'?'Room ended.':'Watch session closed.');q('[data-live]').textContent='CLOSED'});
    socket.on('s_spectator_replay',(data)=>safe('export',()=>{
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`dbt-public-replay-${data.roomCode||roomCode}-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Public replay exported ✅');
    }));
    return socket;
  }

  function startWatch(code,watchKeyValue){
    code=String(code||'').toUpperCase(); watchKeyValue=String(watchKeyValue||''); if(!/^[A-Z2-9]{4}$/.test(code)||!watchKeyValue)return toast('Use a valid DBT watch link.');
    roomCode=code;key=watchKeyValue;eventIds.clear();events.length=0;renderEvents();shell.hidden=false;document.documentElement.dataset.dbtWatch='1';
    const s=createSocket(); if(s.connected)s.emit('c_spectate_room',{roomCode,watchKey:key}); history.replaceState({},'',`/?watch=${encodeURIComponent(roomCode)}&watchKey=${encodeURIComponent(key)}`);
  }

  function parseWatchLink(value){try{const u=new URL(value,location.origin);return{room:String(u.searchParams.get('watch')||'').toUpperCase(),key:String(u.searchParams.get('watchKey')||'')}}catch{return{room:'',key:''}}}

  function mountLaunchButtons(){
    const menu=document.getElementById('menu'); if(!menu||document.getElementById('dbt-spectator-launch'))return;
    const wrap=document.createElement('div');wrap.id='dbt-spectator-launch';
    const join=document.createElement('button');join.type='button';join.textContent='👁 WATCH ROOM';join.onclick=()=>{const value=prompt('Paste a DBT watch link');if(!value)return;const parsed=parseWatchLink(value);startWatch(parsed.room,parsed.key)};
    const host=document.createElement('button');host.type='button';host.className='host-watch';host.textContent='📡 CREATE WATCH LINK';host.hidden=true;
    wrap.append(join,host);menu.appendChild(wrap);
    const gameSocket=window.DBT_CLASSIC_SOCKET;
    if(gameSocket?.on){
      gameSocket.on('s_sync_state',state=>safe('host-state',()=>{const me=(state?.players||[]).find(p=>p.isMe);host.hidden=!me?.isHost;host.dataset.room=state?.roomCode||''}));
      gameSocket.on('s_watch_link',async data=>safe('host-link',async()=>{const url=`${location.origin}/?watch=${encodeURIComponent(data.roomCode)}&watchKey=${encodeURIComponent(data.watchKey)}`;try{await navigator.clipboard.writeText(url);toast('Watch link copied ✅')}catch{toast(url)}}));
      host.onclick=()=>{const code=host.dataset.room;if(code)gameSocket.emit('c_watch_link',{roomCode:code})};
    }
  }

  q('[data-replay]').onclick=()=>{if(socket?.connected&&roomCode&&key)socket.emit('c_spectator_replay',{roomCode,watchKey:key})};
  q('[data-copy]').onclick=async()=>{const url=`${location.origin}/?watch=${encodeURIComponent(roomCode)}&watchKey=${encodeURIComponent(key)}`;try{await navigator.clipboard.writeText(url);toast('Watch link copied ✅')}catch{toast(url)}};
  q('[data-exit]').onclick=()=>{socket?.emit('c_stop_spectating',{});socket?.disconnect();socket=null;roomCode='';key='';current=null;shell.hidden=true;delete document.documentElement.dataset.dbtWatch;history.replaceState({},'','/');};

  const timer=setInterval(mountLaunchButtons,900); window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true}); mountLaunchButtons();
  if(/^[A-Z2-9]{4}$/.test(initialRoom)&&initialKey) setTimeout(()=>startWatch(initialRoom,initialKey),0);
  window.DBT_SPECTATOR={start:startWatch,get active(){return !shell.hidden},get state(){return current}};
})();