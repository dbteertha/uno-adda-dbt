(() => {
  if (window.DBT_MULTIPLAYER_V1) return;
  const stable = window.DBT_STABILITY;
  const safe = (name, fn) => { try { return fn(); } catch (error) { stable?.record?.(`multiplayer:${name}`, error); return undefined; } };
  const mode = (location.pathname.startsWith('/flex') || new URLSearchParams(location.search).get('mode') === 'flex') ? 'flex' : 'classic';
  const socket = mode === 'flex' ? window.DBT_FLEX_SOCKET : window.DBT_CLASSIC_SOCKET;
  if (!socket?.on) { stable?.record?.('multiplayer:init', new Error('Gameplay socket unavailable')); return; }

  const RECENT_KEY = 'dbt-recent-players-v1';
  const MAX_EVENTS = 80;
  let events = [];
  let lastClassicEvent = '';
  let lastFlexAction = '';
  let replayIndex = -1;
  let latestState = null;
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || []; } catch { recent = []; }
  recent = Array.isArray(recent) ? recent.slice(0, 30) : [];

  const btn = document.createElement('button');
  btn.id = 'dbt-mp-launch'; btn.type = 'button'; btn.hidden = true;
  btn.innerHTML = '<span class="pulse"></span><b>MATCH MEMORY</b>';
  const dialog = document.createElement('dialog');
  dialog.id = 'dbt-mp-dialog';
  dialog.innerHTML = `
    <div class="dbt-mp-shell">
      <div class="dbt-mp-head"><span class="dot"></span><div><b>DBT MATCH MEMORY</b><small> · passive multiplayer layer</small></div><button id="dbt-mp-close" type="button">✕</button></div>
      <div class="dbt-mp-tabs">
        <button class="dbt-mp-tab active" data-pane="timeline" type="button">INSTANT REPLAY</button>
        <button class="dbt-mp-tab" data-pane="highlights" type="button">HIGHLIGHTS</button>
        <button class="dbt-mp-tab" data-pane="recent" type="button">RECENT PLAYERS</button>
      </div>
      <div class="dbt-mp-body">
        <section class="dbt-mp-pane" data-pane="timeline">
          <div class="dbt-mp-kpis"><div class="dbt-mp-kpi"><small>MODE</small><b id="dbt-mp-mode">-</b></div><div class="dbt-mp-kpi"><small>EVENTS</small><b id="dbt-mp-events">0</b></div><div class="dbt-mp-kpi"><small>HIGHLIGHTS</small><b id="dbt-mp-highlights">0</b></div><div class="dbt-mp-kpi"><small>PLAYERS</small><b id="dbt-mp-players">0</b></div></div>
          <div class="dbt-mp-replay"><button id="dbt-mp-prev" type="button">‹</button><div class="dbt-mp-stage"><small id="dbt-mp-step">NO EVENTS YET</small><b id="dbt-mp-stage-text">The match timeline will build without changing gameplay.</b><span id="dbt-mp-stage-time"></span></div><button id="dbt-mp-next" type="button">›</button></div>
          <div class="dbt-mp-actions"><button id="dbt-mp-latest" type="button">LATEST</button><button id="dbt-mp-copy" type="button">COPY MATCH RECAP</button><button id="dbt-mp-clear" type="button">CLEAR LOCAL TIMELINE</button></div>
          <div id="dbt-mp-timeline" class="dbt-mp-list"></div>
        </section>
        <section class="dbt-mp-pane" data-pane="highlights" hidden><div id="dbt-mp-highlight-list" class="dbt-mp-list"></div><div class="dbt-mp-note">Highlights are selected locally from major match moments. No card state or private hand data is stored.</div></section>
        <section class="dbt-mp-pane" data-pane="recent" hidden><div id="dbt-mp-recent-list" class="dbt-mp-list"></div><div class="dbt-mp-note">Recent players and favorites stay on this device only.</div></section>
      </div>
    </div>`;
  document.body.append(btn, dialog);
  window.DBT_MULTIPLAYER_V1 = { version: 1, mode, events: () => [...events] };

  const el = (id) => dialog.querySelector(`#${id}`);
  const sessionToken = () => safe('session-token', () => {
    const s = JSON.parse(localStorage.getItem(mode === 'flex' ? 'flex-session' : 'uno-session') || 'null');
    return mode === 'flex' ? (s?.sessionToken || s?.token || '') : (s?.sessionToken || '');
  }) || '';
  const persistRecent = () => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 30))); } catch {} };
  const escapeText = (v) => String(v ?? '').replace(/[<>]/g, '');
  const fmtTime = (at) => new Date(at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const eventIcon = (type, text='') => {
    const t = `${type} ${text}`.toLowerCase();
    if (t.includes('win') || t.includes('জিতে')) return '🏆';
    if (t.includes('draw4') || t.includes('+4')) return '💥';
    if (t.includes('devil')) return '😈';
    if (t.includes('uno')) return '🚨';
    if (t.includes('catch')) return '🫴';
    if (t.includes('challenge')) return '⚔️';
    if (t.includes('reverse')) return '🔄';
    if (t.includes('skip')) return '⏭️';
    if (t.includes('draw')) return '🃏';
    if (t.includes('wild') || t.includes('color')) return '🌈';
    return '•';
  };
  const major = (type, text='') => /win|draw4|devil|uno|catch|challenge|wild_flex_draw4|\+4|জিতে/i.test(`${type} ${text}`);

  function classicText(ev) {
    if (!ev) return '';
    const actor = escapeText(ev.actor || 'Player'), target = escapeText(ev.target || ''), value = escapeText(ev.value || '');
    const map = {
      play: `${actor} played ${value || 'a card'}`,
      draw: `${actor} drew a card`, draw2: `${actor} hit ${target || 'an opponent'} with +2`, draw4: `${actor} hit ${target || 'an opponent'} with +4`,
      skip: `${actor} skipped ${target || 'the next player'}`, reverse: `${actor} reversed direction`, wild: `${actor} changed color${value ? ` to ${value}` : ''}`,
      color: `${actor} chose ${value || 'a color'}`, devil: `${actor} played DEVIL`, uno: `${actor} ${value === 'called' ? 'called UNO' : 'missed UNO'}`,
      catch: `${actor} caught ${target || 'an opponent'} missing UNO`, pass: `${actor} passed`, timeout: `${actor} timed out`, win: `${actor} won the round`, taunt: `${actor}: ${value}`
    };
    return map[ev.type] || `${actor} · ${escapeText(ev.type)}`;
  }

  function pushEvent(item) {
    events.push(item); if (events.length > MAX_EVENTS) events.shift();
    replayIndex = events.length - 1;
    render();
  }

  function rememberPlayers(players=[]) {
    const meToken = sessionToken();
    for (const p of players) {
      const isMe = mode === 'classic' ? !!p.isMe : p.token === meToken;
      if (isMe || p.isBot) continue;
      const name = String(p.displayName || p.name || '').trim(); if (!name) continue;
      const avatar = String(p.avatar || '😎');
      const key = `${mode}:${name.toLowerCase()}:${avatar}`;
      const old = recent.find(x => x.key === key);
      if (old) { old.lastSeen = Date.now(); old.avatar = avatar; }
      else recent.unshift({ key, name, avatar, mode, lastSeen:Date.now(), favorite:false });
    }
    recent.sort((a,b) => Number(b.favorite)-Number(a.favorite) || b.lastSeen-a.lastSeen);
    recent = recent.slice(0,30); persistRecent();
  }

  function onClassic(s) {
    safe('classic-state', () => {
      latestState = s; rememberPlayers(s?.players || []); btn.hidden = false;
      const ev = s?.lastEvent;
      if (ev?.id && ev.id !== lastClassicEvent) {
        lastClassicEvent = ev.id;
        const text = classicText(ev); if (text) pushEvent({ id:ev.id, type:ev.type || 'event', text, at:ev.at || Date.now(), highlight:major(ev.type,text) });
      } else render();
    });
  }
  function onFlex(s) {
    safe('flex-state', () => {
      latestState = s; rememberPlayers(s?.players || []); btn.hidden = false;
      const action = String(s?.lastAction || '').trim();
      if (action && action !== lastFlexAction) {
        lastFlexAction = action;
        const id = `flex:${Date.now()}:${action}`;
        pushEvent({ id, type:'flex', text:escapeText(action), at:Date.now(), highlight:major('flex',action) });
      } else render();
    });
  }

  function renderReplay() {
    const stage = events[replayIndex] || null;
    el('dbt-mp-events').textContent = String(events.length);
    el('dbt-mp-highlights').textContent = String(events.filter(x=>x.highlight).length);
    el('dbt-mp-mode').textContent = mode.toUpperCase();
    el('dbt-mp-players').textContent = String((latestState?.players || []).length);
    el('dbt-mp-step').textContent = stage ? `EVENT ${replayIndex+1} / ${events.length}` : 'NO EVENTS YET';
    el('dbt-mp-stage-text').textContent = stage?.text || 'The match timeline will build without changing gameplay.';
    el('dbt-mp-stage-time').textContent = stage ? `${eventIcon(stage.type,stage.text)} ${fmtTime(stage.at)}${stage.highlight?' · HIGHLIGHT':''}` : '';
    el('dbt-mp-prev').disabled = replayIndex <= 0; el('dbt-mp-next').disabled = replayIndex < 0 || replayIndex >= events.length-1;
  }
  function renderEvents(targetId, list) {
    const box = el(targetId); box.replaceChildren();
    if (!list.length) { const empty=document.createElement('div'); empty.className='dbt-mp-empty'; empty.textContent='No match moments yet.'; box.appendChild(empty); return; }
    for (const item of [...list].reverse()) {
      const row=document.createElement('div'); row.className=`dbt-mp-event${item.highlight?' highlight':''}`;
      const ico=document.createElement('span'); ico.className='ico'; ico.textContent=eventIcon(item.type,item.text);
      const copy=document.createElement('div'); copy.className='copy';
      const b=document.createElement('b'); b.textContent=item.text; const small=document.createElement('small'); small.textContent=`${fmtTime(item.at)}${item.highlight?' · saved highlight':''}`;
      copy.append(b,small); row.append(ico,copy); row.onclick=()=>{replayIndex=events.findIndex(x=>x.id===item.id);renderReplay()}; box.appendChild(row);
    }
  }
  function renderRecent() {
    const box=el('dbt-mp-recent-list'); box.replaceChildren();
    if (!recent.length) { const empty=document.createElement('div');empty.className='dbt-mp-empty';empty.textContent='Players you meet will appear here.';box.appendChild(empty);return; }
    for (const p of recent) {
      const row=document.createElement('div'); row.className='dbt-mp-person';
      const av=document.createElement('span'); av.textContent=p.avatar || '😎';
      const copy=document.createElement('div');copy.className='copy'; const b=document.createElement('b');b.textContent=p.name; const s=document.createElement('small');s.textContent=`${String(p.mode).toUpperCase()} · ${new Date(p.lastSeen).toLocaleDateString()}`;copy.append(b,s);
      const fav=document.createElement('button');fav.type='button';fav.className=p.favorite?'on':'';fav.textContent=p.favorite?'★':'☆';fav.title=p.favorite?'Remove favorite':'Favorite player';fav.onclick=()=>{p.favorite=!p.favorite;persistRecent();renderRecent()};
      row.append(av,copy,fav);box.appendChild(row);
    }
  }
  function render() { safe('render',()=>{ renderReplay(); renderEvents('dbt-mp-timeline',events); renderEvents('dbt-mp-highlight-list',events.filter(x=>x.highlight)); renderRecent(); }); }

  btn.onclick = () => { render(); dialog.showModal(); };
  el('dbt-mp-close').onclick = () => dialog.close();
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('.dbt-mp-tab').forEach(tab => tab.addEventListener('click', () => {
    dialog.querySelectorAll('.dbt-mp-tab').forEach(x=>x.classList.toggle('active',x===tab));
    dialog.querySelectorAll('.dbt-mp-pane').forEach(p=>p.hidden=p.dataset.pane!==tab.dataset.pane);
  }));
  el('dbt-mp-prev').onclick=()=>{if(replayIndex>0){replayIndex--;renderReplay()}};
  el('dbt-mp-next').onclick=()=>{if(replayIndex<events.length-1){replayIndex++;renderReplay()}};
  el('dbt-mp-latest').onclick=()=>{replayIndex=events.length-1;renderReplay()};
  el('dbt-mp-clear').onclick=()=>{events=[];replayIndex=-1;lastClassicEvent='';lastFlexAction='';render()};
  el('dbt-mp-copy').onclick=async()=>{
    const lines=events.filter(x=>x.highlight).slice(-8).map(x=>`• ${x.text}`); const room=latestState?.roomCode||'----';
    const text=`DBT Games · ${mode.toUpperCase()} · Room ${room}\n${lines.length?lines.join('\n'):'No highlights recorded yet.'}`;
    try{await navigator.clipboard.writeText(text);window.DBT_UI?.toast?.('Match recap copied ✅')}catch{window.DBT_UI?.toast?.(text)}
  };

  if (mode === 'classic') socket.on('s_sync_state', onClassic); else socket.on('f_state', onFlex);
  socket.on(mode === 'classic' ? 's_session_expired' : 'f_left', () => { btn.hidden = true; if (dialog.open) dialog.close(); });
  render();
})();
