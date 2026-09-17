(() => {
  if (window.DBT_ARENA_V1) return;
  window.DBT_ARENA_V1 = true;
  const $ = (id) => document.getElementById(id);
  const socket = io('/arena', { reconnection:true, reconnectionAttempts:Infinity, reconnectionDelay:600, reconnectionDelayMax:3500 });
  const state = { room:'', live:null, frames:[], replayIndex:-1, invite:'' };
  let toastTimer=0;

  function toast(message){
    const el=$('arena-toast'); if(!el)return; el.textContent=String(message||''); el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{el.hidden=true},2600);
  }
  function normCode(value){return String(value||'').trim().toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,4)}
  function pathRoom(){
    const m=location.pathname.match(/^\/spectate=([A-Z2-9]{4})\/?$/i);
    return m?.[1]?.toUpperCase() || new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  }
  function pathInvite(){return new URLSearchParams(location.search).get('invite') || ''}
  function showStage(){ $('stage').hidden=false; $('stage-room').textContent=`ROOM ${state.room}`; }
  function eventLabel(ev){
    if(!ev)return ['⚡','Waiting for action','Public match events appear here.'];
    const map={play:'🃏',draw:'🎴',draw2:'+2',draw4:'+4',skip:'⏭️',reverse:'↻',wild:'🌈',devil:'😈',uno:'🚨',catch:'👀',pass:'⏭',timeout:'⏱️',win:'🏆',color:'🎨',taunt:'💬'};
    const title=[ev.actor,ev.type?.replaceAll('_',' ')].filter(Boolean).join(' · ');
    const detail=[ev.target?`Target: ${ev.target}`:'',ev.value!=null?String(ev.value):''].filter(Boolean).join(' · ') || new Date(ev.at||Date.now()).toLocaleTimeString();
    return [map[ev.type]||'⚡',title||'Match update',detail];
  }
  function renderSnapshot(snapshot, replay=false){
    if(!snapshot)return; showStage();
    $('stage-status').textContent=snapshot.paused?'PAUSED':snapshot.status||'—';
    $('stage-round').textContent=String(snapshot.round??0);
    const color=$('stage-color'); color.textContent=snapshot.activeColor||'—'; color.className=`color-${snapshot.activeColor||''}`;
    $('stage-card').textContent=snapshot.topDiscardCard?`${snapshot.topDiscardCard.color} ${snapshot.topDiscardCard.value}`:'—';
    $('stage-draw').textContent=String(snapshot.drawPileCount??'—');
    $('spectator-count').textContent=`${snapshot.spectators??0} watching`;
    const grid=$('player-grid'); grid.replaceChildren();
    for(const p of snapshot.players||[]){
      const card=document.createElement('article'); card.className=`player${p.isCurrent?' current':''}`;
      const av=document.createElement('span');av.className='avatar';av.textContent=p.avatar||'🎮';
      const name=document.createElement('b');name.textContent=p.name||'Player';
      const meta=document.createElement('small');meta.textContent=`${p.connected?'online':'offline'}${p.isBot?' · bot':''} · ${p.wins||0} wins · ${p.score||0} pts`;
      const cards=document.createElement('div');cards.className='cards';cards.textContent=`${p.cardCount??0} cards${p.isCurrent?' · turn':''}`;
      card.append(av,name,meta,cards);grid.appendChild(card);
    }
    const [ico,title,detail]=eventLabel(snapshot.lastEvent);$('event-icon').textContent=ico;$('event-title').textContent=title;$('event-detail').textContent=detail;
    $('replay-time').textContent=replay?new Date(snapshot.at||Date.now()).toLocaleTimeString():'LIVE';
  }
  function renderRooms(rooms=[]){
    const list=$('room-list'); list.replaceChildren();
    if(!rooms.length){const p=document.createElement('p');p.className='empty';p.textContent='No public rooms right now.';list.appendChild(p);return}
    for(const room of rooms){
      const row=document.createElement('article');row.className='room-card';
      const copy=document.createElement('div');copy.className='room-copy';const b=document.createElement('b');b.textContent=`${room.roomCode} · ${room.status}`;
      const small=document.createElement('small');small.textContent=`${(room.players||[]).map(p=>`${p.avatar||''} ${p.name}`).join(' · ')} · ${room.spectators||0} watching`;
      copy.append(b,small);const button=document.createElement('button');button.type='button';button.textContent='WATCH';button.onclick=()=>watch(room.roomCode,'');row.append(copy,button);list.appendChild(row);
    }
  }
  function renderLeaderboard(rows=[]){
    const list=$('leaderboard'); list.replaceChildren();
    if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent='No completed rounds in this server session yet.';list.appendChild(p);return}
    rows.slice(0,20).forEach((r,i)=>{
      const row=document.createElement('div');row.className='leader-row';const rank=document.createElement('span');rank.className='rank';rank.textContent=`#${i+1}`;
      const copy=document.createElement('span');const b=document.createElement('b');b.textContent=`${r.avatar||'🎮'} ${r.name}`;const small=document.createElement('small');small.textContent=`${r.matches||0} matches`;copy.append(b,small);
      const stats=document.createElement('span');stats.className='leader-stats';stats.textContent=`${r.wins||0} W · ${r.points||0} pts`;row.append(rank,copy,stats);list.appendChild(row);
    });
  }
  function watch(code, invite=''){
    code=normCode(code); if(code.length!==4)return toast('Enter a valid 4-character room code.');
    state.room=code; state.invite=invite||''; state.frames=[]; state.replayIndex=-1; $('watch-code').value=code; $('watch-invite').value=state.invite;
    socket.emit('a_watch',{roomCode:code,...(state.invite?{inviteKey:state.invite}:{})});
  }
  function loadReplay(){socket.emit('a_replay',{})}
  function setReplayIndex(index){
    if(!state.frames.length)return; const i=Math.max(0,Math.min(state.frames.length-1,index));state.replayIndex=i;$('replay-range').value=String(i);renderSnapshot(state.frames[i],true);
  }
  function goLive(){state.replayIndex=-1;$('replay-range').value=String(Math.max(0,state.frames.length-1));renderSnapshot(state.live,false)}

  socket.on('connect',()=>{document.querySelector('.live')?.classList.add('online');$('arena-connection').textContent='LIVE';socket.emit('a_refresh',{});const code=pathRoom();if(code)watch(code,pathInvite())});
  socket.on('disconnect',()=>{document.querySelector('.live')?.classList.remove('online');$('arena-connection').textContent='RECONNECTING'});
  socket.on('a_error',d=>toast(d?.message||'Arena request failed.'));
  socket.on('a_rooms',d=>renderRooms(d?.rooms||[]));
  socket.on('a_leaderboard',d=>renderLeaderboard(d?.rows||[]));
  socket.on('a_watching',d=>{state.room=d?.roomCode||state.room;showStage();toast(`Watching room ${state.room}`);history.replaceState({},'',`/spectate=${state.room}${state.invite?`?invite=${encodeURIComponent(state.invite)}`:''}`)});
  socket.on('a_spectators',d=>{if(d?.roomCode===state.room)$('spectator-count').textContent=`${d.spectators||0} watching`});
  socket.on('a_snapshot',snapshot=>{if(snapshot?.roomCode!==state.room)return;state.live=snapshot;if(state.replayIndex<0)renderSnapshot(snapshot,false)});
  socket.on('a_replay',d=>{if(d?.roomCode!==state.room)return;state.frames=Array.isArray(d.frames)?d.frames:[];const range=$('replay-range');range.max=String(Math.max(0,state.frames.length-1));range.disabled=state.frames.length<2;if(state.frames.length){setReplayIndex(state.frames.length-1);toast(`${state.frames.length} public replay frames loaded`) }else toast('No replay frames are available yet.')});

  $('watch-form').addEventListener('submit',e=>{e.preventDefault();watch($('watch-code').value,$('watch-invite').value.trim())});
  $('watch-code').addEventListener('input',e=>{e.target.value=normCode(e.target.value)});
  $('refresh-btn').onclick=()=>socket.emit('a_refresh',{});
  $('replay-btn').onclick=loadReplay;$('live-btn').onclick=goLive;
  $('replay-range').addEventListener('input',e=>setReplayIndex(Number(e.target.value)));
})();