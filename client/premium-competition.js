(() => {
  if (window.DBT_COMPETITION_V1 || location.pathname.startsWith('/flex')) return;
  window.DBT_COMPETITION_V1 = true;
  const CLIENT_KEY='dbt-competition-client-id';
  let clientId=localStorage.getItem(CLIENT_KEY);if(!clientId){clientId=crypto.randomUUID();localStorage.setItem(CLIENT_KEY,clientId)}
  let gameSocket=null, comp=null, latestState=null, pendingTask=null, tournament=null, queued=false, queueCount=0, toastTimer=0, bindTimer=0;
  const playerName=()=>String(localStorage.getItem('dbt-player-name')||document.getElementById('name')?.value||'').trim().slice(0,24);
  const avatar=()=>String(localStorage.getItem('uno-avatar')||'⚽').trim().slice(0,8);
  const profile=()=>({clientId,displayName:playerName(),avatar:avatar()});
  const hasRoomSession=()=>{try{const s=JSON.parse(localStorage.getItem('uno-session')||'null');return !!(s?.roomCode&&s?.sessionToken)}catch{return false}};
  const toast=text=>{let el=document.querySelector('.dbt-comp-toast');if(!el){el=document.createElement('div');el.className='dbt-comp-toast';document.body.appendChild(el)}el.textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),2800)};

  const dialog=document.createElement('dialog');dialog.id='dbt-competition-dialog';dialog.innerHTML='<div class="dbt-comp-head"><div><small>DBT GAMES · COMPETITIVE</small><b>Quick Match & Tournament</b></div><button class="dbt-comp-close" type="button">✕</button></div><div class="dbt-comp-body"><div class="dbt-comp-grid"><section class="dbt-comp-card"><small>RANKED · SERVER SESSION</small><h3>⚡ Quick Match</h3><p>Pairs two Classic players, creates a normal DBT room, and updates server-session Elo from the actual round result.</p><div class="dbt-comp-actions"><button class="primary" data-queue type="button">JOIN QUEUE</button><button data-cancel-queue type="button">CANCEL</button></div><div class="dbt-comp-status" data-queue-status>Queue idle.</div></section><section class="dbt-comp-card"><small>4 / 8 PLAYERS</small><h3>🏆 Tournament</h3><p>Create or join a bracket. Matches hand off to the existing Classic room engine; winners advance from actual round results.</p><div class="dbt-comp-actions"><select data-size><option value="4">4 players</option><option value="8">8 players</option></select><button class="primary" data-create-t type="button">CREATE</button></div><div class="dbt-comp-actions"><input data-code maxlength="6" placeholder="TOURNEY CODE" autocomplete="off"><button data-join-t type="button">JOIN</button></div><div class="dbt-comp-actions"><button data-leave-t type="button">LEAVE WAITING TOURNAMENT</button></div><div class="dbt-comp-status" data-t-status>No active tournament.</div></section></div><div class="dbt-comp-bracket" data-bracket></div><div class="dbt-leaderboard"><div><small>SERVER-SESSION ELO</small><h3>Competitive leaderboard</h3></div><div data-leaders></div></div></div>';document.body.appendChild(dialog);
  const q=s=>dialog.querySelector(s);

  function ensureComp(){
    if(comp)return comp;if(typeof io!=='function')return null;comp=io('/competition',{reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:700,reconnectionDelayMax:3500});
    comp.on('connect',()=>{comp.emit('t_resume',{clientId});render();});
    comp.on('m_error',d=>{toast(d?.message||'Competitive service error');queued=false;render()});
    comp.on('m_queue_status',d=>{queueCount=Number(d?.queued||0);render()});
    comp.on('m_queued',()=>{queued=true;render();toast('Quick Match queue joined')});
    comp.on('m_pair',d=>{queued=false;render();toast(`Matched vs ${d?.opponent?.name||'player'}`);pendingTask={kind:'ranked',matchId:d.matchId,role:d.role,roomCode:null};if(d.role==='host')prepareTask();});
    comp.on('m_room',d=>{if(!pendingTask||pendingTask.matchId!==d.matchId)pendingTask={kind:'ranked',matchId:d.matchId,role:'guest',roomCode:d.roomCode};else pendingTask.roomCode=d.roomCode;prepareTask()});
    comp.on('m_room_confirmed',d=>toast(`Ranked room ${d?.roomCode||''} ready`));
    comp.on('m_rating',d=>toast(`Rating ${d?.rating} (${Number(d?.delta)>=0?'+':''}${d?.delta})`));
    comp.on('m_match_result',d=>{toast(`${d?.winnerName||'Player'} won the ranked round`);pendingTask=null;render()});
    comp.on('m_leaderboard',d=>renderLeaders(d?.rows||[]));
    comp.on('t_state',d=>{tournament=d;renderTournament();render()});
    comp.on('t_match',d=>{toast(`Tournament round ${d?.round}: vs ${d?.opponent?.name||'player'}`);pendingTask={kind:'tournament',matchId:d.matchId,code:d.code,role:d.role,roomCode:null};prepareTask()});
    comp.on('t_room',d=>{if(!pendingTask||pendingTask.matchId!==d.matchId)pendingTask={kind:'tournament',code:d.code,matchId:d.matchId,role:'guest',roomCode:d.roomCode};else pendingTask.roomCode=d.roomCode;prepareTask()});
    comp.on('t_room_confirmed',d=>toast(`Tournament room ${d?.roomCode||''} ready`));
    comp.on('t_finished',d=>{toast(`Tournament champion: ${d?.winnerName||'player'} 🏆`);pendingTask=null;render()});
    return comp;
  }

  function ensureGame(){
    if(gameSocket?.on)return true;gameSocket=window.DBT_CLASSIC_SOCKET;if(!gameSocket?.on)return false;
    gameSocket.on('s_sync_state',s=>{latestState=s});
    gameSocket.on('s_room_created',d=>{
      if(!pendingTask||pendingTask.role!=='host'||!d?.roomCode)return;
      const payload={matchId:pendingTask.matchId,roomCode:d.roomCode};
      if(pendingTask.kind==='ranked')ensureComp()?.emit('m_room_ready',payload);else ensureComp()?.emit('t_room_ready',payload);
    });
    gameSocket.on('s_session_expired',()=>{latestState=null;setTimeout(()=>executePending(),120)});
    return true;
  }

  function canStartCompetition(){
    if(!playerName()){toast('Set your player name first.');return false}
    if(latestState?.status==='PLAYING'||latestState?.status==='LOBBY'||hasRoomSession()){toast('Leave your current room before entering competitive matchmaking.');return false}
    return true;
  }
  function leaveFinishedRoomThen(next){
    if(!ensureGame())return toast('Classic game connection is not ready.');
    if(hasRoomSession()||latestState){pendingTask=next;try{gameSocket.emit('c_leave_room',{})}catch{setTimeout(executePending,200)};return}
    pendingTask=next;executePending();
  }
  function prepareTask(){
    if(!pendingTask)return;if(!ensureGame())return setTimeout(prepareTask,250);
    if(hasRoomSession()||latestState){if(latestState?.status==='PLAYING'||latestState?.status==='LOBBY')return;try{gameSocket.emit('c_leave_room',{})}catch{};return}
    executePending();
  }
  function executePending(){
    if(!pendingTask||!ensureGame())return;const p=profile();if(!p.displayName)return toast('Player name missing.');if(!gameSocket.connected)gameSocket.connect();
    if(pendingTask.role==='host'){gameSocket.emit('c_create_room',{displayName:p.displayName,avatar:p.avatar});}
    else if(pendingTask.roomCode){gameSocket.emit('c_join_room',{displayName:p.displayName,avatar:p.avatar,roomCode:pendingTask.roomCode});}
  }

  function renderLeaders(rows=[]){const box=q('[data-leaders]');box.replaceChildren();if(!rows.length){const s=document.createElement('small');s.textContent='No rated matches completed in this server session yet.';box.appendChild(s);return}rows.slice(0,12).forEach((r,i)=>{const row=document.createElement('div');row.className='dbt-leader-row';const rank=document.createElement('b');rank.textContent=`#${i+1}`;const who=document.createElement('span');const b=document.createElement('b');b.textContent=`${r.avatar||'🎮'} ${r.name}`;const s=document.createElement('small');s.textContent=`${r.wins||0} wins · ${r.games||0} games`;who.append(b,s);const rating=document.createElement('strong');rating.textContent=String(r.rating||1000);row.append(rank,who,rating);box.appendChild(row)})}
  function renderTournament(){
    const box=q('[data-bracket]');box.replaceChildren();if(!tournament)return;
    (tournament.rounds||[]).forEach((round,ri)=>{const sec=document.createElement('section');sec.className='dbt-round';const title=document.createElement('small');title.textContent=`ROUND ${ri+1}`;sec.appendChild(title);round.forEach(m=>{const row=document.createElement('div');row.className='dbt-match';const a=document.createElement('span');a.textContent=m.aName||'TBD';const vs=document.createElement('small');vs.textContent=m.status==='finished'?'FINAL':'VS';const b=document.createElement('span');b.textContent=m.bName||'TBD';if(m.winnerId===m.aId)a.className='winner';if(m.winnerId===m.bId)b.className='winner';row.append(a,vs,b);sec.appendChild(row)});box.appendChild(sec)});
  }
  function render(){
    q('[data-queue]').textContent=queued?'QUEUED…':'JOIN QUEUE';q('[data-queue-status]').textContent=queued?`Searching · ${queueCount} player${queueCount===1?'':'s'} in queue`:`Queue idle · ${queueCount} waiting now`;
    q('[data-t-status]').textContent=tournament?`${tournament.code} · ${tournament.status.toUpperCase()} · ${tournament.entrants?.length||0}/${tournament.size}`:'No active tournament.';renderTournament();
  }
  function mountButton(){const menu=document.getElementById('menu');if(!menu||document.getElementById('dbt-compete-open'))return;const btn=document.createElement('button');btn.id='dbt-compete-open';btn.type='button';btn.textContent='🏆 COMPETE · QUICK MATCH & TOURNAMENT';btn.onclick=()=>{ensureComp();render();dialog.showModal()};menu.appendChild(btn)}

  q('.dbt-comp-close').onclick=()=>dialog.close();
  q('[data-queue]').onclick=()=>{if(queued)return;if(!canStartCompetition())return;ensureComp()?.emit('m_join',profile())};
  q('[data-cancel-queue]').onclick=()=>{ensureComp()?.emit('m_cancel',{});queued=false;render()};
  q('[data-create-t]').onclick=()=>{if(!canStartCompetition())return;ensureComp()?.emit('t_create',{...profile(),size:Number(q('[data-size]').value)})};
  q('[data-code]').addEventListener('input',e=>{e.target.value=String(e.target.value||'').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6)});
  q('[data-join-t]').onclick=()=>{if(!canStartCompetition())return;const code=q('[data-code]').value.trim().toUpperCase();if(code.length!==6)return toast('Enter the 6-character tournament code.');ensureComp()?.emit('t_join',{...profile(),code})};
  q('[data-leave-t]').onclick=()=>ensureComp()?.emit('t_leave',{});
  bindTimer=setInterval(()=>{ensureGame();mountButton()},700);ensureGame();mountButton();ensureComp();render();window.addEventListener('beforeunload',()=>clearInterval(bindTimer),{once:true});
  window.DBT_COMPETITION={open:()=>{ensureComp();render();dialog.showModal()},get clientId(){return clientId},get tournament(){return tournament}};
})();