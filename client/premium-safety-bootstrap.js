(() => {
  if (window.DBT_SAFETY) return;
  const KEY='dbt-safety-v1';
  const load=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&Array.isArray(x.blocked)?x:{blocked:[]}}catch{return{blocked:[]}}};
  const store=load();
  const norm=(v)=>String(v||'').trim().toLocaleLowerCase();
  const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(store))}catch{}};
  const api={
    isBlocked(name){return store.blocked.includes(norm(name))},
    block(name){const n=norm(name);if(n&&!store.blocked.includes(n)){store.blocked.push(n);persist();window.dispatchEvent(new CustomEvent('dbt-safety-change'))}},
    unblock(name){const n=norm(name),i=store.blocked.indexOf(n);if(i>=0){store.blocked.splice(i,1);persist();window.dispatchEvent(new CustomEvent('dbt-safety-change'))}},
    get blocked(){return [...store.blocked]},
  };
  window.DBT_SAFETY=api;

  const original=window.io;
  if(typeof original!=='function')return;
  const wrapSocket=(socket)=>{
    if(!socket||socket.__dbtSafetyWrapped)return socket;
    socket.__dbtSafetyWrapped=true;
    const on=socket.on.bind(socket);
    socket.on=(event,handler)=>{
      if((event==='s_troll_reaction'||event==='s_sound_reaction')&&typeof handler==='function'){
        return on(event,(payload,...rest)=>{if(api.isBlocked(payload?.senderName))return;return handler(payload,...rest)});
      }
      return on(event,handler);
    };
    return socket;
  };
  const wrapped=function(...args){return wrapSocket(original(...args))};
  Object.assign(wrapped,original);
  window.io=wrapped;
})();