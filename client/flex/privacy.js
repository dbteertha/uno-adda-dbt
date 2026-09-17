(() => {
  if (window.DBT_FLEX_PRIVACY_V1) return;
  window.DBT_FLEX_PRIVACY_V1 = true;
  const qs=new URLSearchParams(location.search);
  const invite=String(qs.get('invite')||'');
  const linkedRoom=String(qs.get('roomCode')||'').toUpperCase();
  let socket=null,policy=null,pendingJoin=null,bound=false,timer=0;
  const saved=()=>{try{const x=JSON.parse(localStorage.getItem('flex-session')||'null');return x?.roomCode&&x?.token?x:null}catch{return null}};
  const toast=(text)=>{const el=document.getElementById('toast');if(el){el.textContent=text;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2800)}};
  if(linkedRoom&&/^[A-Z2-9]{4}$/.test(linkedRoom)){const input=document.getElementById('room-code');if(input)input.value=linkedRoom}

  const panel=document.createElement('section');panel.id='dbt-flex-privacy';panel.hidden=true;panel.innerHTML='<div class="dbt-fp-head"><div><b>🔒 FLEX ROOM PRIVACY</b><small>Host-controlled · gameplay unchanged</small></div><span class="dbt-fp-pill" data-pill>PUBLIC</span></div><div class="dbt-fp-options"><button type="button" data-v="public">PUBLIC</button><button type="button" data-v="private">PRIVATE</button><button type="button" data-v="invite">INVITE ONLY</button></div><p class="dbt-fp-copy" data-copy>Public: anyone with the room code can join.</p><div class="dbt-fp-actions"><button type="button" data-copy-link>COPY JOIN LINK</button><button type="button" class="rotate" data-rotate>ROTATE INVITE KEY</button></div><p class="dbt-fp-join-note" data-note hidden>Invite-only rooms require the current generated link. A copied room code by itself will not work.</p>';

  const q=(s)=>panel.querySelector(s);
  function mount(){
    const lobby=document.getElementById('lobby');if(!lobby)return;
    if(!panel.isConnected){const anchor=document.getElementById('room-code-show')||lobby.firstElementChild;anchor?.insertAdjacentElement('afterend',panel)}
  }
  function shareUrl(){
    const s=saved();if(!s)return location.href;
    const p=new URLSearchParams({mode:'multi',roomCode:s.roomCode,tutorial:'before'});
    if(policy?.visibility==='invite'&&policy?.inviteKey)p.set('invite',policy.inviteKey);
    return `${location.origin}/flex/?${p.toString()}`;
  }
  function render(){
    mount();const s=saved();panel.hidden=!s||!policy||policy.roomCode!==s.roomCode;if(panel.hidden)return;
    q('[data-pill]').textContent=String(policy.visibility||'public').toUpperCase().replaceAll('_',' ');
    panel.querySelectorAll('[data-v]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.v===policy.visibility);btn.disabled=!policy.isHost||policy.status!=='LOBBY'});
    const text=policy.visibility==='public'?'Public: room-code joins are allowed.':policy.visibility==='private'?'Private: hidden from discovery; room-code joins still work.':'Invite only: players need the current secure Flex invite link.';
    q('[data-copy]').textContent=text;q('[data-note]').hidden=policy.visibility!=='invite';q('[data-rotate]').hidden=!policy.isHost;q('[data-rotate]').disabled=!policy.isHost||policy.status!=='LOBBY';
    q('[data-copy-link]').textContent=policy.visibility==='invite'?'COPY SECURE INVITE':'COPY JOIN LINK';
  }
  function requestState(){const s=saved();if(socket?.connected&&s)socket.emit('fp_get_state',{roomCode:s.roomCode,sessionToken:s.token})}
  function setPrivacy(next,rotateInvite=false){const s=saved();if(!s||!socket?.connected)return;socket.emit('fp_set_privacy',{roomCode:s.roomCode,sessionToken:s.token,visibility:next,rotateInvite})}

  function bind(){
    if(bound)return true;socket=window.DBT_FLEX_SOCKET;if(!socket?.on||!socket?.emit)return false;bound=true;
    const originalEmit=socket.emit.bind(socket);
    socket.emit=(event,...args)=>{
      if(event==='f_join'&&invite){const payload=args[0]||{};pendingJoin={payload};originalEmit('fp_authorize_join',{roomCode:String(payload.roomCode||'').toUpperCase(),inviteKey:invite});return socket}
      return originalEmit(event,...args);
    };
    socket.on('fp_join_authorized',({roomCode}={})=>{if(!pendingJoin)return;const payload=pendingJoin.payload;pendingJoin=null;if(String(payload.roomCode||'').toUpperCase()===String(roomCode||'').toUpperCase())originalEmit('f_join',payload)});
    socket.on('fp_error',({message}={})=>{pendingJoin=null;toast(message||'Flex privacy request failed.')});
    socket.on('fp_state',(data)=>{policy=data;render()});
    socket.on('f_room',()=>setTimeout(requestState,0));
    socket.on('f_state',()=>setTimeout(requestState,0));
    socket.on('connect',()=>setTimeout(requestState,30));
    requestState();return true;
  }

  panel.querySelectorAll('[data-v]').forEach(btn=>btn.onclick=()=>setPrivacy(btn.dataset.v,false));
  q('[data-rotate]').onclick=()=>setPrivacy(policy?.visibility||'invite',true);
  q('[data-copy-link]').onclick=async()=>{const url=shareUrl();try{await navigator.clipboard.writeText(url);toast(policy?.visibility==='invite'?'Secure Flex invite copied ✅':'Flex join link copied ✅')}catch{toast(url)}};
  timer=setInterval(()=>{mount();bind();if(policy)render()},850);window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});mount();bind();
  window.DBT_FLEX_PRIVACY={get state(){return policy},refresh:requestState};
})();