(() => {
  const $ = (id) => document.getElementById(id);
  const screens = ['tutorial','mode','setup','lobby','game'];
  const show = (id) => screens.forEach((s) => $(s).hidden = s !== id);
  const toast = (msg) => { const el=$('toast'); el.textContent=msg; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>el.hidden=true,2800); };
  const qs = new URLSearchParams(location.search);
  const entry = ['bot','create','join'].includes(qs.get('entry')) ? qs.get('entry') : null;
  let selectedMode = qs.get('mode') === 'bot' ? 'bot' : qs.get('mode') === 'multi' ? 'multi' : null;
  let avatar = qs.get('avatar') || localStorage.getItem('flex-avatar') || '😎';
  let state = null;
  let saved = null;
  let pendingCard = null;
  let pendingSide = null;
  let tutorialIndex = 0;
  const knownCards = new Map();
  try { saved = JSON.parse(localStorage.getItem('flex-session') || 'null'); } catch {}
  if (entry) { saved = null; localStorage.removeItem('flex-session'); }
  const socket = io('/flex', { autoConnect: false });

  const tutorials = [
    { icon:'⚡', title:'What makes Flex different?', body:'You still match by color, number, or symbol — but some cards also have a secondary FLEX side. Your Power Card decides whether that FLEX side is available.', demo:'power' },
    { icon:'🟢', title:'Power Cards: ON / OFF', body:'Everyone starts with Power ON. When you use a FLEX side, your Power flips OFF. While OFF, you cannot use FLEX sides. If everyone is OFF at once, everybody resets to ON.', demo:'power' },
    { icon:'🎨', title:'Regular side vs FLEX side', body:'A regular side plays normally. A FLEX side can match using its secondary color when your Power is ON. Playing a non-Wild FLEX side does NOT change the active color — it only lets the card match it.', demo:'flex' },
    { icon:'🔁', title:'Flip symbol', body:'Some numbered cards carry a Flip symbol. Playing one toggles your own Power Card ON ↔ OFF. A Wild All Flip toggles every player’s Power Card.', demo:'flip' },
    { icon:'⏭️', title:'Flex Skip', body:'Regular: skip the next player. FLEX: skip everybody else, so you immediately get another turn.', demo:'skip' },
    { icon:'🔄', title:'Flex Reverse', body:'Regular: reverse direction. FLEX: reverse direction and also skip the first player in the new direction.', demo:'reverse' },
    { icon:'+2', title:'Flex Draw Two', body:'Regular: next player draws 2 and loses their turn. FLEX: every other player draws 1, and the next player still gets their turn.', demo:'draw' },
    { icon:'🌈', title:'Flex Wild cards', body:'Wild Flex All Draw: FLEX makes everyone else draw 2. Wild Flex Target Draw 2: FLEX lets you choose who draws 2. Wild cards still let you choose the continuing color.', demo:'wild' },
    { icon:'+4', title:'Wild Draw Four + Challenge', body:'Regular Wild Draw 4 targets the next player. They may challenge. If the play was illegal, the player who used +4 draws 4; if the challenge fails, the challenger draws 6. FLEX mode lets you target any opponent for 4.', demo:'wild4' },
    { icon:'🚨', title:'Draw, Pass, UNO', body:'On your turn you may PASS even if you have a playable card. If you draw, you may then play or PASS. You can only draw once in that turn. At one card, press UNO before someone catches you.', demo:'uno' }
  ];

  function tutorialDemo(type){
    if(type==='power') return '<div class="card-demo"><div class="mini-card green">ON ✓</div><div class="mini-card red">OFF ✕</div></div>';
    if(type==='flex') return '<div class="card-demo"><div class="mini-card blue">7</div><div class="mini-card red">FLEX 7</div></div>';
    if(type==='flip') return '<div class="card-demo"><div class="mini-card yellow">3 ↻</div><div class="mini-card wild">ALL ↻</div></div>';
    if(type==='skip') return '<div class="card-demo"><div class="mini-card red">SKIP</div><div class="mini-card blue">FLEX<br>SKIP ALL</div></div>';
    if(type==='reverse') return '<div class="card-demo"><div class="mini-card green">↻</div><div class="mini-card yellow">FLEX<br>↺ + SKIP</div></div>';
    if(type==='draw') return '<div class="card-demo"><div class="mini-card blue">+2</div><div class="mini-card red">FLEX<br>ALL +1</div></div>';
    if(type==='wild4') return '<div class="card-demo"><div class="mini-card wild">+4</div><div class="mini-card wild">FLEX<br>TARGET +4</div></div>';
    if(type==='uno') return '<div class="card-demo"><div class="mini-card red">PASS</div><div class="mini-card yellow">UNO!</div></div>';
    return '<div class="card-demo"><div class="mini-card wild">WILD</div><div class="mini-card wild">TARGET</div></div>';
  }

  function renderTutorial(){
    const t = tutorials[tutorialIndex];
    $('tutorial-progress').textContent = `${tutorialIndex+1} / ${tutorials.length}`;
    $('tutorial-card').innerHTML = `<div class="icon">${t.icon}</div><h2>${t.title}</h2><p>${t.body}</p>${tutorialDemo(t.demo)}`;
    $('tutorial-back').disabled = tutorialIndex === 0;
    $('tutorial-next').textContent = tutorialIndex === tutorials.length-1 ? (entry ? 'Start UNO Flex ⚡' : 'Choose mode ⚡') : 'Next →';
  }

  function emitWhenConnected(eventName, payload){
    const send = () => socket.emit(eventName, payload);
    if(socket.connected) send(); else { socket.once('connect', send); socket.connect(); }
  }

  function beginIntegratedEntry(){
    const displayName=(qs.get('name')||'DBT Player').slice(0,24);
    const av=(qs.get('avatar')||avatar).slice(0,8);
    if(entry==='bot') return emitWhenConnected('f_create_bot',{displayName,avatar:av});
    if(entry==='create') return emitWhenConnected('f_create_multi',{displayName,avatar:av});
    if(entry==='join') {
      const roomCode=(qs.get('roomCode')||'').toUpperCase();
      if(roomCode.length!==4){toast('Flex room code is missing');return show('setup');}
      return emitWhenConnected('f_join',{roomCode,displayName,avatar:av});
    }
  }

  $('tutorial-back').onclick = () => { if(tutorialIndex>0){tutorialIndex--;renderTutorial();} };
  $('tutorial-next').onclick = () => {
    if(tutorialIndex < tutorials.length-1){tutorialIndex++;renderTutorial();return;}
    localStorage.setItem('flex-tutorial-seen','1');
    if(entry){beginIntegratedEntry();return;}
    if(selectedMode){openSetup(selectedMode);} else show('mode');
  };
  $('tutorial-again').onclick = () => { tutorialIndex=0; renderTutorial(); show('tutorial'); };
  renderTutorial();

  if(qs.get('name')) $('name').value=qs.get('name').slice(0,24);
  document.querySelectorAll('.mode-card').forEach(btn => btn.onclick = () => openSetup(btn.dataset.mode));
  document.querySelectorAll('[data-go="mode"]').forEach(btn => btn.onclick = () => show('mode'));
  document.querySelectorAll('#avatars button').forEach(btn => { if(btn.textContent===avatar)btn.classList.add('active'); else btn.classList.remove('active'); btn.onclick=()=>{avatar=btn.textContent;localStorage.setItem('flex-avatar',avatar);document.querySelectorAll('#avatars button').forEach(b=>b.classList.toggle('active',b===btn));}; });

  function openSetup(mode){ selectedMode=mode; $('setup-mode-label').textContent = mode==='bot'?'BOT MODE':'MULTIPLAYER'; $('join-wrap').hidden = mode==='bot'; $('create-flex').textContent = mode==='bot'?'Start vs 3 Bots 🤖':'Create Flex Room ⚡'; show('setup'); }
  function name(){ return ($('name').value.trim() || 'DBT Player').slice(0,24); }
  function ensureSocket(){ if(!socket.connected) socket.connect(); }
  $('create-flex').onclick = () => { ensureSocket(); socket.emit(selectedMode==='bot'?'f_create_bot':'f_create_multi',{displayName:name(),avatar}); };
  $('join-flex').onclick = () => { const roomCode=$('room-code').value.trim().toUpperCase(); if(roomCode.length!==4)return toast('Enter the 4-character room code'); ensureSocket(); socket.emit('f_join',{roomCode,displayName:name(),avatar}); };
  $('room-code').oninput = (e) => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,4);
  $('ready').onclick = () => { const me=state?.players.find(p=>p.token===saved?.token); socket.emit('f_ready',{ready:!me?.ready}); };
  $('room-code-show').onclick = async () => { try{ await navigator.clipboard.writeText(state.roomCode); toast('Room code copied'); }catch{} };
  $('draw').onclick = () => socket.emit('f_draw',{});
  $('uno').onclick = () => socket.emit('f_uno',{});
  $('catch').onclick = () => socket.emit('f_catch',{});
  $('accept4').onclick = () => socket.emit('f_draw4',{challenge:false});
  $('challenge4').onclick = () => socket.emit('f_draw4',{challenge:true});
  $('leave').onclick = () => { socket.emit('f_leave',{}); localStorage.removeItem('flex-session'); location.href='/'; };

  const myStripActions = document.querySelector('.my-strip > div:last-child');
  const passButton = document.createElement('button');
  passButton.id='flex-pass'; passButton.className='ghost'; passButton.textContent='PASS ⏭'; passButton.onclick=()=>socket.emit('f_pass',{});
  myStripActions?.appendChild(passButton);

  socket.on('connect',()=>{ if(!entry && saved?.roomCode && saved?.token) socket.emit('f_reconnect',{roomCode:saved.roomCode,sessionToken:saved.token}); });
  socket.on('f_room',({roomCode,sessionToken})=>{ saved={roomCode,token:sessionToken};localStorage.setItem('flex-session',JSON.stringify(saved)); });
  socket.on('f_error',({message})=>toast(message));
  socket.on('f_left',()=>{state=null;saved=null;localStorage.removeItem('flex-session');location.href='/';});
  socket.on('f_state',(s)=>{state=s;renderState();});

  function symbol(c){
    if(c.kind==='NUMBER') return `${c.value}${c.flipPower?' ↻':''}`;
    return ({SKIP:'⊘',REVERSE:'↻',DRAW2:'+2',FLEX_SKIP:'SKIP',FLEX_REVERSE:'↻',FLEX_DRAW2:'+2',WILD_ALL_FLIP:'ALL ↻',WILD_FLEX_ALL_DRAW:'ALL +2',WILD_FLEX_TARGET_DRAW2:'TARGET +2',WILD_FLEX_DRAW4:'+4'})[c.kind]||c.kind;
  }
  function colorClass(c){return c?.toLowerCase?.()||'wild';}
  function identity(c){return `${c.kind}|${c.color||'WILD'}|${c.value??''}|${c.flexColor||''}|${c.flipPower?1:0}`;}
  function cardHtml(c, interactive=false){
    const sides=c.legalSides||[]; const playable=sides.length?' playable':'';
    const flex = c.flexColor ? `<div class="flex-side" style="background:${cssColor(c.flexColor)}">FLEX ${c.flexColor}</div>` : '<div></div>';
    return `<button class="flex-card ${colorClass(c.color)}${playable}" ${interactive?'data-id="'+c.id+'"':''}><span class="top">${c.color||'WILD'}</span><span class="symbol">${symbol(c)}</span>${flex}</button>`;
  }
  function cssColor(c){return ({RED:'#d9364e',YELLOW:'#d9b92f',GREEN:'#23a766',BLUE:'#267ec7'})[c]||'#333';}

  function verifyCards(hand){
    for(const c of hand){
      const sig=identity(c); const prev=knownCards.get(c.id);
      if(prev && prev!==sig){toast('Card stability check failed — refreshing state'); knownCards.clear(); return false;}
      knownCards.set(c.id,sig);
    }
    return true;
  }

  function renderState(){
    if(!state)return;
    if(state.status==='LOBBY'){
      show('lobby'); $('room-code-show').textContent=state.roomCode;
      $('lobby-players').innerHTML=state.players.map(p=>`<div class="player"><div class="meta"><span>${p.avatar}</span><b>${p.name}</b></div><span>${p.isBot?'BOT':p.ready?'READY ✅':'WAITING'}</span></div>`).join('');
      const me=state.players.find(p=>p.token===saved?.token); $('ready').textContent=me?.ready?'NOT READY':'READY ⚡';
      return;
    }
    show('game');
    verifyCards(state.hand);
    const me=state.players.find(p=>p.token===saved?.token);
    $('me-name').textContent=`${me?.avatar||''} ${me?.name||''}`;
    $('power-pill').textContent=me?.powerOn?'POWER ON ✓':'POWER OFF ✕'; $('power-pill').className=`power ${me?.powerOn?'on':'off'}`;
    $('active-color').style.background=cssColor(state.activeColor); $('active-color').title=state.activeColor;
    $('deck-count').textContent=`${state.deckCount} CARDS`;
    $('discard').innerHTML=state.top?cardHtml(state.top):'';
    $('action-log').textContent=state.lastAction||'';
    $('players').innerHTML=state.players.map(p=>`<div class="player"><div class="meta"><span>${p.avatar}</span><span><b>${p.name}</b><small> · ${p.cardCount} cards</small></span></div><span class="power ${p.powerOn?'on':'off'}">${p.powerOn?'ON':'OFF'}</span></div>`).join('');
    $('hand').innerHTML=state.hand.map(c=>cardHtml(c,true)).join('');
    document.querySelectorAll('#hand [data-id]').forEach(el=>el.onclick=()=>openPlay(state.hand.find(c=>c.id===el.dataset.id)));
    $('challenge').hidden=!state.pendingDraw4;
    const myTurn=state.currentToken===saved?.token && state.status==='PLAYING' && !state.pendingDraw4;
    $('status').textContent=state.status==='FINISHED' ? `${state.players.find(p=>p.token===state.winner)?.name||'Player'} WINS 🏆` : myTurn ? 'YOUR TURN ⚡' : `${state.players.find(p=>p.token===state.currentToken)?.name||''}'s turn`;
    $('draw').disabled=!myTurn || state.hasDrawn;
    passButton.disabled=!myTurn;
    passButton.title=myTurn?'Pass this turn even if you have a playable card':'Wait for your turn';
  }

  function openPlay(card){
    if(!card?.legalSides?.length)return toast('This card is not playable now');
    pendingCard=card; pendingSide=null; $('play-title').textContent=`${symbol(card)} · choose side`; $('play-desc').textContent=card.flexColor?`Regular ${card.color||'Wild'} / Flex ${card.flexColor}`:'Regular side';
    $('side-buttons').innerHTML=card.legalSides.map(side=>`<button data-side="${side}" class="${side==='FLEX'?'flex-option':''}">${side==='FLEX'?'⚡ FLEX SIDE':'REGULAR SIDE'}</button>`).join('');
    $('color-buttons').hidden=true; $('target').hidden=true; $('cancel-play').onclick=()=>$('play-dialog').close();
    document.querySelectorAll('#side-buttons [data-side]').forEach(btn=>btn.onclick=()=>chooseSide(btn.dataset.side));
    $('play-dialog').showModal();
  }
  function chooseSide(side){ pendingSide=side; const wild=pendingCard.color===null; const needsTarget=side==='FLEX' && ['WILD_FLEX_TARGET_DRAW2','WILD_FLEX_DRAW4'].includes(pendingCard.kind); if(needsTarget){const opponents=state.players.filter(p=>p.token!==saved.token);$('target').innerHTML='<option value="">Choose target…</option>'+opponents.map(p=>`<option value="${p.token}">${p.name}</option>`).join('');$('target').hidden=false;} if(wild){$('color-buttons').hidden=false;document.querySelectorAll('#color-buttons [data-color]').forEach(btn=>btn.onclick=()=>submitPlay(btn.dataset.color));} else submitPlay(); }
  function submitPlay(chosenColor){ const targetToken=$('target').hidden?undefined:$('target').value||undefined; if(!$('target').hidden&&!targetToken)return toast('Choose a target'); socket.emit('f_play',{cardId:pendingCard.id,side:pendingSide,chosenColor,targetToken}); $('play-dialog').close(); }

  // Integrated UNO Adda entry always shows the complete tutorial first.
  if(entry) show('tutorial');
  else {
    const seen = localStorage.getItem('flex-tutorial-seen')==='1';
    if(seen && selectedMode) openSetup(selectedMode); else show('tutorial');
  }
})();