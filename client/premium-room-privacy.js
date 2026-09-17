(() => {
  if (window.DBT_ROOM_PRIVACY_V1) return;
  const socket = window.DBT_CLASSIC_SOCKET;
  if (!socket?.on || !socket?.emit) return;
  window.DBT_ROOM_PRIVACY_V1 = true;
  const stable=window.DBT_STABILITY;
  const safe=(name,fn)=>{try{const v=fn();if(v&&typeof v.catch==='function')v.catch(e=>stable?.record?.(`room-privacy:${name}`,e));return v}catch(e){stable?.record?.(`room-privacy:${name}`,e);return undefined}};
  const params=new URLSearchParams(location.search);
  const inviteFromUrl=params.get('invite')||'';
  let state=null;

  const join=document.getElementById('join');
  if(join){
    join.addEventListener('submit',(event)=>{
      event.preventDefault();event.stopImmediatePropagation();
      const name=document.getElementById('name')?.value?.trim();
      const roomCode=document.getElementById('code')?.value?.trim()?.toUpperCase();
      const activeAvatar=document.querySelector('.avatar.active');
      const avatar=activeAvatar?.dataset?.avatar||activeAvatar?.textContent?.trim()?.slice(0,8)||'😎';
      if(!name){document.getElementById('name')?.focus();window.DBT_UI?.toast?.('Enter your name first');return}
      if(!/^[A-Z2-9]{4}$/.test(roomCode||'')){document.getElementById('code')?.focus();window.DBT_UI?.toast?.('Enter a valid room code');return}
      const payload={displayName:name,avatar,roomCode};
      if(inviteFromUrl)payload.inviteKey=inviteFromUrl;
      socket.emit('c_join_room',payload);
    },true);
  }

  const panel=document.createElement('section');
  panel.id='dbt-room-privacy';
  panel.hidden=true;
  panel.innerHTML=`<div class="dbt-rp-head"><div><small>ROOM ACCESS</small><b data-title>Public room</b></div><span data-badge>PUBLIC</span></div><p data-copy>Anyone can discover this room while it is waiting for players.</p><div class="dbt-rp-options"><button data-visibility="public" type="button">🌐 PUBLIC</button><button data-visibility="private" type="button">🔒 PRIVATE</button><button data-visibility="invite" type="button">🔑 INVITE ONLY</button></div><div class="dbt-rp-actions"><button data-copy-link type="button">COPY INVITE</button><button data-rotate type="button">ROTATE INVITE KEY</button></div><small data-help></small>`;

  function host(){return !!state?.players?.find?.(p=>p.isMe)?.isHost || !!state?.players?.[0]?.isMe}
  function visibility(){return ['public','private','invite'].includes(state?.roomVisibility)?state.roomVisibility:'public'}
  function inviteUrl(){
    if(!state?.roomCode)return location.origin;
    const base=`${location.origin}/room=${encodeURIComponent(state.roomCode)}`;
    return visibility()==='invite'&&state.inviteKey?`${base}?invite=${encodeURIComponent(state.inviteKey)}`:base;
  }
  function mount(){const lobby=document.getElementById('lobby');if(lobby&&!panel.isConnected){const anchor=lobby.querySelector('.room-code')||lobby.firstElementChild;anchor?.insertAdjacentElement?.('afterend',panel)}}
  function render(){
    mount();if(!state||state.status!=='LOBBY'){panel.hidden=true;return}
    panel.hidden=false;const v=visibility(),isHost=host();
    const details={public:['Public room','PUBLIC','Anyone can discover this room while it is waiting for players.'],private:['Private room','PRIVATE','Hidden from the public room browser. Players can still join with the room code.'],invite:['Invite-only room','INVITE ONLY','Hidden from discovery and protected by a server-generated invite key.']}[v];
    panel.querySelector('[data-title]').textContent=details[0];panel.querySelector('[data-badge]').textContent=details[1];panel.querySelector('[data-copy]').textContent=details[2];
    panel.querySelectorAll('[data-visibility]').forEach(b=>{b.classList.toggle('active',b.dataset.visibility===v);b.disabled=!isHost});
    panel.querySelector('[data-rotate]').hidden=!isHost||v!=='invite';
    panel.querySelector('[data-copy-link]').textContent=v==='invite'?'COPY SECURE INVITE':'COPY ROOM LINK';
    panel.querySelector('[data-help]').textContent=isHost?'Only the host can change room access. Changes are allowed before the match starts.':`Host controls this room's ${details[1].toLowerCase()} access.`;
  }
  panel.querySelectorAll('[data-visibility]').forEach(b=>b.onclick=()=>{if(host())socket.emit('c_room_privacy',{visibility:b.dataset.visibility})});
  panel.querySelector('[data-rotate]').onclick=()=>{if(host())socket.emit('c_room_privacy',{visibility:'invite',rotateInvite:true})};
  panel.querySelector('[data-copy-link]').onclick=()=>safe('copy',async()=>{const text=inviteUrl();try{await navigator.clipboard.writeText(text);window.DBT_UI?.toast?.('Room invite copied 🔗')}catch{window.DBT_UI?.toast?.(text)}});
  socket.on('s_sync_state',next=>{state=next;render()});
  socket.on('s_error',payload=>{if(String(payload?.message||'').includes('invite'))panel.classList.add('dbt-rp-attention')});
  new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
  mount();
})();
