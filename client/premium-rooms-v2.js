(() => {
  if (window.DBT_ROOMS_V2) return;
  window.DBT_ROOMS_V2 = true;

  const stable = window.DBT_STABILITY;
  const mode = (location.pathname.startsWith('/flex') || new URLSearchParams(location.search).get('mode') === 'flex') ? 'flex' : 'classic';
  const socket = mode === 'classic' ? window.DBT_CLASSIC_SOCKET : null;
  const safe = (name, fn) => { try { return fn(); } catch (error) { stable?.record?.(`rooms-v2:${name}`, error); return undefined; } };

  let classicState = null;
  let classicMeta = null;
  let disposed = false;
  let lastRenderKey = '';
  let seriesTarget = Number(localStorage.getItem('dbt-series-target') || 1);
  if (![1,2,3].includes(seriesTarget)) seriesTarget = 1;

  const PRESETS = [
    { id:'classic', label:'PURE CLASSIC', icon:'🎴', desc:'Wild +4 · no Devil · no powers', config:{ wild:true, drawFour:true, devil:false, powers:[] } },
    { id:'light', label:'POWER LIGHT', icon:'🛡️', desc:'Shield + Magnet', config:{ wild:true, drawFour:true, devil:false, powers:['SHIELD','MAGNET'] } },
    { id:'tactical', label:'TACTICAL', icon:'⏱️', desc:'Shield + Freeze + Devil', config:{ wild:true, drawFour:true, devil:true, powers:['SHIELD','TIME_FREEZE'] } },
    { id:'dbt', label:'FULL DBT', icon:'⚡', desc:'All DBT cards and powers', config:{ wild:true, drawFour:true, devil:true, powers:['MAGNET','SHIELD','TIME_FREEZE','ROBBERY'] } },
    { id:'chaos', label:'CHAOS', icon:'😈', desc:'Full DBT party preset', config:{ wild:true, drawFour:true, devil:true, powers:['MAGNET','SHIELD','TIME_FREEZE','ROBBERY'] } }
  ];

  const panel = document.createElement('section');
  panel.id = 'dbt-room-hq-v2';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="dbt-r2-head"><span class="dbt-r2-dot"></span><b>DBT ROOM COMMAND</b><small>LOBBY ONLY · MATCH PASSIVE</small></div>
    <div class="dbt-r2-actions"><button id="dbt-r2-copy" type="button">COPY INVITE LINK</button><button id="dbt-r2-share" type="button">SHARE ROOM</button></div>
    <div class="dbt-r2-grid">
      <div class="dbt-r2-stat"><small>ROOM</small><b id="dbt-r2-code">----</b></div>
      <div class="dbt-r2-stat"><small>MODE</small><b>${mode.toUpperCase()}</b></div>
      <div class="dbt-r2-stat"><small>NETWORK</small><b id="dbt-r2-net">CONNECTED</b></div>
    </div>
    <div id="dbt-r2-presets-block"><div class="dbt-r2-sub"><b>ROOM PRESETS</b><small>Classic host · lobby only</small></div><div id="dbt-r2-presets" class="dbt-r2-presets"></div></div>
    <div class="dbt-r2-sub"><b>SESSION FORMAT</b><small>presentation only</small></div>
    <div class="dbt-r2-series-wrap"><button class="dbt-r2-series" data-series="1" type="button">SINGLE ROUND</button><button class="dbt-r2-series" data-series="2" type="button">BEST OF 3</button><button class="dbt-r2-series" data-series="3" type="button">FIRST TO 3</button></div>
    <div class="dbt-r2-note">This panel never changes turn flow, card state, timers, reconnect rules or Flex gameplay.</div>`;

  function toast(text){
    safe('toast',()=>{
      let el=document.querySelector('.dbt-r2-toast');
      if(!el){ el=document.createElement('div'); el.className='dbt-r2-toast'; document.body.appendChild(el); }
      el.textContent=text; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true},2200);
    });
  }

  function sessionInfo(){
    return safe('session',()=>{
      const raw=localStorage.getItem(mode==='flex' ? 'flex-session' : 'uno-session');
      const s=raw ? JSON.parse(raw) : null;
      const roomCode=String(s?.roomCode || '').toUpperCase();
      const token=mode==='flex' ? (s?.sessionToken || s?.token) : s?.sessionToken;
      return token && /^[A-Z2-9]{4}$/.test(roomCode) ? {roomCode,token} : null;
    }) || null;
  }

  function lobbyVisible(){
    const lobby=document.getElementById('lobby');
    return !!lobby && !lobby.hidden && getComputedStyle(lobby).display!=='none';
  }

  function inviteUrl(){
    const info=sessionInfo();
    return info ? `${location.origin}/room=${info.roomCode}?mode=${mode}` : location.origin;
  }

  async function copyInvite(){
    const url=inviteUrl();
    try { await navigator.clipboard.writeText(url); toast('Invite link copied ✅'); }
    catch { toast(url); }
  }

  async function shareInvite(){
    const info=sessionInfo(); const url=inviteUrl();
    try {
      if(navigator.share) await navigator.share({title:'DBT Games room', text:`Join my ${mode==='flex'?'UNO Flex':'UNO Classic'} room ${info?.roomCode || ''}`, url});
      else await copyInvite();
    } catch {}
  }

  function configKey(config){
    if(!config) return '';
    return [!!config.wild,!!config.drawFour,!!config.devil,[...(config.powers||[])].sort().join('|')].join(':');
  }

  function currentConfig(){
    if(!classicMeta) return null;
    return { wild:!!classicMeta.specialCards?.wild, drawFour:!!classicMeta.specialCards?.drawFour, devil:!!classicMeta.specialCards?.devil, powers:[...(classicMeta.enabledPowers||[])] };
  }

  function applyPreset(preset){
    if(mode!=='classic' || !socket || !classicMeta?.isHost || classicState?.status!=='LOBBY') return toast('Classic host can change presets only in the lobby.');
    socket.emit('c_classic_config', preset.config);
    toast(`${preset.icon} ${preset.label} applied`);
  }

  function renderPresets(){
    const block=panel.querySelector('#dbt-r2-presets-block');
    const wrap=panel.querySelector('#dbt-r2-presets');
    if(!block || !wrap) return;
    block.hidden=mode!=='classic';
    if(mode!=='classic') return;
    wrap.replaceChildren();
    const current=configKey(currentConfig());
    for(const preset of PRESETS){
      const b=document.createElement('button');
      b.type='button'; b.className='dbt-r2-preset'; b.disabled=!classicMeta?.isHost || classicState?.status!=='LOBBY';
      if(current===configKey(preset.config)) b.classList.add('active');
      const icon=document.createElement('span'); icon.textContent=preset.icon;
      const label=document.createElement('b'); label.textContent=preset.label;
      const desc=document.createElement('small'); desc.textContent=preset.desc;
      b.append(icon,label,desc); b.addEventListener('click',()=>applyPreset(preset)); wrap.appendChild(b);
    }
  }

  function render(){
    if(disposed) return;
    const info=sessionInfo();
    const show=!!info && lobbyVisible();
    panel.hidden=!show;
    if(!show) return;

    const players = mode==='classic' ? (classicState?.players || []) : [];
    const key=JSON.stringify({room:info.roomCode,online:navigator.onLine!==false,seriesTarget,status:classicState?.status,isHost:classicMeta?.isHost,cfg:configKey(currentConfig()),players:players.map(p=>[p.displayName,p.wins,p.isBot])});
    if(key===lastRenderKey) return;
    lastRenderKey=key;

    const code=panel.querySelector('#dbt-r2-code'); if(code) code.textContent=info.roomCode;
    const net=panel.querySelector('#dbt-r2-net'); if(net) net.textContent=navigator.onLine===false?'OFFLINE':'CONNECTED';
    panel.querySelectorAll('.dbt-r2-series').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.series)===seriesTarget));
    renderPresets();
  }

  function mountOnce(){
    const lobby=document.getElementById('lobby');
    if(!lobby || panel.isConnected) return;
    const anchor = mode==='classic' ? (document.getElementById('classic-rules-panel') || document.getElementById('lobby-players')) : null;
    if(anchor?.parentNode===lobby) anchor.insertAdjacentElement('afterend',panel); else lobby.appendChild(panel);
  }

  panel.querySelector('#dbt-r2-copy')?.addEventListener('click',copyInvite);
  panel.querySelector('#dbt-r2-share')?.addEventListener('click',shareInvite);
  panel.querySelectorAll('.dbt-r2-series').forEach(btn=>btn.addEventListener('click',()=>{
    const n=Number(btn.dataset.series); if(![1,2,3].includes(n)) return;
    seriesTarget=n; localStorage.setItem('dbt-series-target',String(n)); lastRenderKey=''; render(); toast(`Session format: ${btn.textContent}`);
  }));

  window.addEventListener('online',()=>{lastRenderKey='';render()});
  window.addEventListener('offline',()=>{lastRenderKey='';render()});

  if(socket?.on){
    socket.on('s_sync_state', s=>safe('state',()=>{classicState=s; lastRenderKey=''; render()}));
    socket.on('s_classic_meta', m=>safe('meta',()=>{classicMeta=m; lastRenderKey=''; render()}));
  }

  mountOnce();
  const timer=setInterval(()=>safe('heartbeat',()=>{mountOnce();render()}),2500);
  window.addEventListener('beforeunload',()=>{disposed=true;clearInterval(timer)},{once:true});
  render();
})();