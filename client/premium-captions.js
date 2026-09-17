(() => {
  if (window.DBT_CAPTIONS_V1) return;
  window.DBT_CAPTIONS_V1 = true;
  const stable=window.DBT_STABILITY;
  const safe=(name,fn)=>{try{return fn()}catch(error){stable?.record?.(`captions:${name}`,error);return undefined}};
  const KEY='dbt-game-captions-v1';
  let enabled=localStorage.getItem(KEY)!=='off';
  let hideTimer=0;
  const mode=location.pathname.startsWith('/flex')?'flex':'classic';
  const socket=mode==='flex'?window.DBT_FLEX_SOCKET:window.DBT_CLASSIC_SOCKET;

  const bar=document.createElement('div');bar.id='dbt-caption-bar';bar.hidden=true;bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');bar.setAttribute('aria-atomic','true');
  bar.innerHTML='<span class="dbt-caption-icon">CC</span><span data-caption-text></span>';
  document.body.appendChild(bar);
  const button=document.createElement('button');button.id='dbt-caption-toggle';button.type='button';button.setAttribute('aria-label','Toggle visual captions');
  const host=document.querySelector('.top-actions')||document.querySelector('.flex-top')||document.body;host.appendChild(button);
  const text=bar.querySelector('[data-caption-text]');

  function syncButton(){button.textContent=enabled?'CC✓':'CC';button.classList.toggle('active',enabled);button.title=enabled?'Visual captions on':'Visual captions off'}
  function caption(message,icon='🔊',duration=3000){
    if(!enabled)return;const clean=String(message||'').replace(/\s+/g,' ').trim();if(!clean)return;
    clearTimeout(hideTimer);bar.querySelector('.dbt-caption-icon').textContent=icon;text.textContent=clean.slice(0,220);bar.hidden=false;bar.classList.remove('dbt-caption-hit');void bar.offsetWidth;bar.classList.add('dbt-caption-hit');hideTimer=setTimeout(()=>{bar.hidden=true},duration);
  }
  button.onclick=()=>{enabled=!enabled;localStorage.setItem(KEY,enabled?'on':'off');syncButton();if(enabled)caption('Visual captions enabled','CC',1800);else bar.hidden=true};
  syncButton();

  const labels={
    'headphone-1':'Headphone sound','kemon-aso':'Kemon aso voice reaction','fast':'Fast voice reaction','gorib':'Gorib voice reaction','rag-korla':'Rag korla voice reaction','dhoka':'Dhoka voice reaction','khoma':'Khoma voice reaction','big-fan-bhai':'Big fan bhai voice reaction','ashraful':'Ashraful voice reaction','uhuhu-babare':'Uhuhu babare voice reaction','vul':'Vul voice reaction'
  };
  socket?.on?.('s_sound_reaction',payload=>caption(`${payload?.senderName||'Player'} played: ${labels[payload?.soundId]||payload?.soundId||'sound reaction'}`,'🔊'));
  socket?.on?.('s_takeover_notice',payload=>caption(payload?.active?`AI is temporarily holding ${payload?.name||'a player'}'s seat`:`${payload?.name||'Player'} reconnected and regained control`,'🔌'));
  socket?.on?.('disconnect',()=>caption('Connection lost. Reconnecting automatically.','📡',4000));
  socket?.on?.('connect',()=>caption('Game connection active.','📡',1600));

  const ui=window.DBT_UI;
  ui?.bus?.addEventListener('specialfx',event=>{
    const kind=String(event.detail?.kind||'').toLowerCase();
    const map={reverse:'Reverse played',skip:'Skip played',draw2:'Draw Two played',draw4:'Wild Draw Four played',wild:'Wild card played',devil:'Devil power activated',magnet:'Magnet power activated',shield:'Shield power activated',freeze:'Freeze power activated',robbery:'Robbery power activated',challenge:'Challenge event'};
    if(map[kind])caption(map[kind],kind==='draw4'?'💥':'✨',2200);
  });
  ui?.bus?.addEventListener('socialmoment',event=>caption(`${event.detail?.title||''}${event.detail?.detail?` — ${event.detail.detail}`:''}`,'🎙️',2600));
  ui?.bus?.addEventListener('voiceactivity',event=>{if(event.detail?.speaking)caption('A player is speaking in voice chat','🎙️',1400)});
  ui?.bus?.addEventListener('voicepolicychange',event=>caption(event.detail?.policy?.enabled===false?'Room voice was disabled by the host':event.detail?.policy?.pttOnly?'Room voice now requires push-to-talk':'Room voice allows open mic','🎙️',2800));
  ui?.bus?.addEventListener('accessibilitychange',()=>safe('a11y-sync',()=>{}));
  window.addEventListener('offline',()=>caption('Device offline. Gameplay will reconnect when your network returns.','📡',4500));
  window.addEventListener('online',()=>caption('Device back online.','📡',2200));
  window.DBT_CAPTIONS={get enabled(){return enabled},caption,setEnabled(value){enabled=!!value;localStorage.setItem(KEY,enabled?'on':'off');syncButton();if(!enabled)bar.hidden=true}};
})();
