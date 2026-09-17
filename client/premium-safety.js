(() => {
  if (window.DBT_SAFETY_V1 || location.pathname.startsWith('/flex')) return;
  window.DBT_SAFETY_V1 = true;
  const STORE='dbt-safety-v1';
  const SOUND_MAP={
    'headphone-1':'/sounds/headphone-1.mp3','kemon-aso':'/sounds/kemon-aso.mp3','fast':'/sounds/fast.mp3','gorib':'/sounds/gorib.mp3','rag-korla':'/sounds/rag-korla.mp3','dhoka':'/sounds/dhoka.mp3','khoma':'/sounds/khoma.mp3','big-fan-bhai':'/sounds/big-fan-bhai.mp3','ashraful':'/sounds/ashraful.mp3','uhuhu-babare':'/sounds/uhuhu-babare.mp3','vul':'/sounds/vul.mp3'
  };
  const SOUND_LABEL=Object.fromEntries(Object.keys(SOUND_MAP).map(k=>[k,k.replaceAll('-',' ')]));
  let state={blocked:[],muteReactions:false};
  let latest=null, socket=null, bound=false, timer=0, toastTimer=0;
  try{state={...state,...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{}
  const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(state))}catch{}};
  const blocked=name=>state.blocked.some(x=>x.toLocaleLowerCase()===String(name||'').trim().toLocaleLowerCase());
  const toast=text=>{let el=document.querySelector('.dbt-safety-toast');if(!el){el=document.createElement('div');el.className='dbt-safety-toast';document.body.appendChild(el)}el.textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),2600)};

  const dialog=document.createElement('dialog');dialog.id='dbt-safety-dialog';dialog.innerHTML='<div class="dbt-safety-head"><div><small>DBT GAMES · SAFETY</small><b>Block, mute & report</b></div><button class="dbt-safety-close" type="button">✕</button></div><div class="dbt-safety-body"><div class="dbt-safety-note">Blocks are stored on this device. Blocked players’ curated Troll and room-sound reactions are suppressed locally. Reports are structured and rate-limited; gameplay actions are never changed by this panel.</div><div class="dbt-safety-toggle"><div><b>Mute all room reactions</b><small>Keep card sounds/gameplay UI, silence social Troll/sound reactions.</small></div><button data-mute-all type="button"></button></div><div class="dbt-safety-players" data-players></div><div class="dbt-safety-report" data-report hidden><b data-report-title>Report player</b><select data-reason><option value="harassment">Harassment / bullying</option><option value="spam">Spam / disruptive behavior</option><option value="hate">Hate or hateful conduct</option><option value="sexual">Sexual content</option><option value="threats">Threats / intimidation</option><option value="cheating">Cheating / exploit suspicion</option><option value="voice">Voice-room abuse</option><option value="other">Other</option></select><textarea data-note maxlength="180" placeholder="Optional note (max 180 characters)"></textarea><div class="dbt-safety-report-actions"><button data-cancel type="button">CANCEL</button><button data-submit type="button">SUBMIT REPORT</button></div></div></div>';document.body.appendChild(dialog);
  const q=s=>dialog.querySelector(s); let reportTarget='';

  function render(){
    q('[data-mute-all]').textContent=state.muteReactions?'MUTED ✓':'MUTE';
    const box=q('[data-players]');box.replaceChildren();
    const players=(latest?.players||[]).filter(p=>!p.isMe&&!p.isBot);
    if(!players.length){const x=document.createElement('small');x.textContent='Other human players will appear here after you join a room.';box.appendChild(x);return}
    for(const p of players){const row=document.createElement('div');row.className='dbt-safety-player';const copy=document.createElement('div');const b=document.createElement('b');b.textContent=`${p.avatar||'🎮'} ${p.displayName}`;const s=document.createElement('small');s.textContent=blocked(p.displayName)?'Blocked on this device':'Not blocked';copy.append(b,s);
      const block=document.createElement('button');block.type='button';block.textContent=blocked(p.displayName)?'UNBLOCK':'BLOCK';block.onclick=()=>{if(blocked(p.displayName))state.blocked=state.blocked.filter(x=>x.toLocaleLowerCase()!==p.displayName.toLocaleLowerCase());else state.blocked=[...state.blocked,p.displayName];save();render();toast(blocked(p.displayName)?`${p.displayName} blocked`:`${p.displayName} unblocked`)};
      const report=document.createElement('button');report.type='button';report.className='danger';report.textContent='REPORT';report.onclick=()=>{reportTarget=p.displayName;q('[data-report-title]').textContent=`Report ${p.displayName}`;q('[data-note]').value='';q('[data-report]').hidden=false;q('[data-reason]').focus()};row.append(copy,block,report);box.appendChild(row)}
  }
  function showTroll(sender,text){if(state.muteReactions||blocked(sender))return;toast(`💬 ${sender}: ${text}`)}
  function playSound(sender,id){if(state.muteReactions||blocked(sender))return;const src=SOUND_MAP[id];if(!src)return;toast(`🔊 ${sender}: ${SOUND_LABEL[id]||id}`);if(localStorage.getItem('uno-sound')==='off')return;try{const a=new Audio(src);a.volume=.9;a.play().catch(()=>{})}catch{}}
  function bindSocket(){
    if(bound)return true;socket=window.DBT_CLASSIC_SOCKET;if(!socket?.on||!socket?.off)return false;bound=true;
    setTimeout(()=>{
      try{socket.off('s_troll_reaction');socket.off('s_sound_reaction')}catch{}
      socket.on('s_troll_reaction',d=>showTroll(d?.senderName,d?.text));
      socket.on('s_sound_reaction',d=>playSound(d?.senderName,d?.soundId));
      socket.on('s_sync_state',d=>{latest=d;render()});
      socket.on('s_safety_ack',d=>{q('[data-report]').hidden=true;toast(`Report submitted for ${d?.target||'player'} ✅`)});
      socket.on('s_safety_error',d=>toast(d?.message||'Report could not be submitted.'));
    },1200);
    return true;
  }
  function mountButton(){
    if(document.getElementById('dbt-safety-open'))return;const anchor=document.querySelector('.top-actions')||document.getElementById('lobby')||document.getElementById('menu');if(!anchor)return;const btn=document.createElement('button');btn.id='dbt-safety-open';btn.type='button';btn.textContent='🛡 SAFETY';btn.onclick=()=>{render();dialog.showModal()};anchor.appendChild(btn)
  }

  q('.dbt-safety-close').onclick=()=>dialog.close();q('[data-mute-all]').onclick=()=>{state.muteReactions=!state.muteReactions;save();render();toast(state.muteReactions?'Room reactions muted':'Room reactions enabled')};q('[data-cancel]').onclick=()=>{q('[data-report]').hidden=true;reportTarget=''};q('[data-submit]').onclick=()=>{if(!reportTarget||!socket?.connected)return toast('Player/report connection unavailable.');socket.emit('c_safety_report',{targetName:reportTarget,reason:q('[data-reason]').value,note:q('[data-note]').value.trim()})};
  timer=setInterval(()=>{bindSocket();mountButton()},800);bindSocket();mountButton();window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  window.DBT_SAFETY={isBlocked:blocked,get muteReactions(){return state.muteReactions},open:()=>{render();dialog.showModal()}};
})();