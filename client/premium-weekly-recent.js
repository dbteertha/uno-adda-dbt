(() => {
  if (window.DBT_WEEKLY_RECENT_V1) return;
  window.DBT_WEEKLY_RECENT_V1 = true;
  const stable=window.DBT_STABILITY;
  const safe=(name,fn)=>{try{return fn()}catch(error){stable?.record?.(`weekly-recent:${name}`,error);return undefined}};
  const ROOM_KEY='dbt-recent-rooms-v1';
  const WEEK_KEY='dbt-weekly-goals-v1';
  const mode=location.pathname.startsWith('/flex')?'flex':'classic';
  const socket=mode==='flex'?window.DBT_FLEX_SOCKET:window.DBT_CLASSIC_SOCKET;
  const weekKey=()=>{const d=new Date();const start=new Date(d);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));return start.toISOString().slice(0,10)};
  const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  let rooms=load(ROOM_KEY,[]);if(!Array.isArray(rooms))rooms=[];
  let weekly=load(WEEK_KEY,{week:'',progress:{wins:0,uno:0,reverse:0,powers:0},processed:[]});
  if(weekly.week!==weekKey())weekly={week:weekKey(),progress:{wins:0,uno:0,reverse:0,powers:0},processed:[]};
  const persistRooms=()=>{try{localStorage.setItem(ROOM_KEY,JSON.stringify(rooms.slice(0,8)))}catch{}};
  const persistWeekly=()=>{try{localStorage.setItem(WEEK_KEY,JSON.stringify(weekly))}catch{}};
  const session=()=>safe('session',()=>{const raw=localStorage.getItem(mode==='flex'?'flex-session':'uno-session');const s=raw?JSON.parse(raw):null;const roomCode=String(s?.roomCode||'').toUpperCase();return/^[A-Z2-9]{4}$/.test(roomCode)?{roomCode}:null})||null;
  function rememberRoom(){const s=session();if(!s)return;const key=`${mode}:${s.roomCode}`;const old=rooms.find(r=>r.key===key);if(old)old.lastSeen=Date.now();else rooms.unshift({key,mode,roomCode:s.roomCode,lastSeen:Date.now()});rooms.sort((a,b)=>b.lastSeen-a.lastSeen);rooms=rooms.slice(0,8);persistRooms();renderRecent();}

  const recent=document.createElement('section');recent.id='dbt-recent-rooms';recent.innerHTML='<div class="dbt-rrecent-head"><div><small>DBT QUICK RESUME</small><b>Recent rooms</b></div><button data-clear type="button">CLEAR</button></div><div class="dbt-rrecent-list"></div>';
  function mountRecent(){const home=document.getElementById('home');const menu=document.getElementById('menu');const target=!home?.hidden?home:(!menu?.hidden?menu:null);if(target&&!recent.isConnected){const shell=target.querySelector('.launcher-shell')||target; shell.appendChild(recent)}else if(target&&recent.parentNode!==target&&target.querySelector('.launcher-shell')&&recent.parentNode!==target.querySelector('.launcher-shell'))target.querySelector('.launcher-shell').appendChild(recent);}
  function renderRecent(){if(!recent.isConnected)mountRecent();const box=recent.querySelector('.dbt-rrecent-list');if(!box)return;box.replaceChildren();if(!rooms.length){const e=document.createElement('small');e.className='dbt-rrecent-empty';e.textContent='Rooms you create or join will appear here.';box.appendChild(e);return;}for(const r of rooms){const a=document.createElement('a');a.className='dbt-rrecent-item';a.href=`/room=${encodeURIComponent(r.roomCode)}?mode=${encodeURIComponent(r.mode)}`;const left=document.createElement('span');left.innerHTML=`<small>${String(r.mode).toUpperCase()}</small><b>${r.roomCode}</b>`;const time=document.createElement('small');time.textContent=new Date(r.lastSeen).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});a.append(left,time);box.appendChild(a)}}
  recent.querySelector('[data-clear]').onclick=()=>{rooms=[];persistRooms();renderRecent()};

  const weeklyBtn=document.createElement('button');weeklyBtn.id='dbt-weekly-open';weeklyBtn.type='button';weeklyBtn.textContent='📅 WEEKLY';weeklyBtn.title='Weekly goals';
  const weeklyDialog=document.createElement('dialog');weeklyDialog.id='dbt-weekly-dialog';weeklyDialog.innerHTML='<div class="dbt-weekly-shell"><header><div><small>DBT GAMES · WEEKLY</small><h2>Weekly table goals</h2></div><button data-close type="button">✕</button></header><p>Progress is stored on this device and resets each Monday. These goals never change match rules.</p><div class="dbt-weekly-goals"></div></div>';document.body.append(weeklyBtn,weeklyDialog);
  const GOALS=[['wins','🏆','Finish strong','Win 3 recorded rounds',3],['uno','🚨','UNO pressure','Record 5 UNO moments',5],['reverse','🔄','Turn the table','Record 6 Reverse moments',6],['powers','⚡','Power week','Record 12 major power moments',12]];
  function renderWeekly(){const box=weeklyDialog.querySelector('.dbt-weekly-goals');box.replaceChildren();for(const [id,ico,name,desc,goal] of GOALS){const v=Math.min(goal,Number(weekly.progress[id]||0));const card=document.createElement('div');card.className='dbt-weekly-card'+(v>=goal?' done':'');card.innerHTML=`<span class="ico">${ico}</span><div><b>${name}</b><small>${desc}</small><div class="dbt-weekly-track"><i style="width:${Math.min(100,(v/goal)*100)}%"></i></div><span>${v} / ${goal}${v>=goal?' · COMPLETE':''}</span></div>`;box.appendChild(card)}}
  weeklyBtn.onclick=()=>{renderWeekly();weeklyDialog.showModal()};weeklyDialog.querySelector('[data-close]').onclick=()=>weeklyDialog.close();weeklyDialog.addEventListener('click',e=>{if(e.target===weeklyDialog)weeklyDialog.close()});

  function countEvent(item){if(!item?.id||weekly.processed.includes(item.id))return;weekly.processed.push(item.id);if(weekly.processed.length>300)weekly.processed=weekly.processed.slice(-300);const text=`${item.type||''} ${item.text||''}`.toLowerCase();if(/win|won|জিত/.test(text))weekly.progress.wins=(weekly.progress.wins||0)+1;if(/uno/.test(text))weekly.progress.uno=(weekly.progress.uno||0)+1;if(/reverse/.test(text))weekly.progress.reverse=(weekly.progress.reverse||0)+1;if(/draw4|draw2|devil|shield|robbery|freeze|magnet|wild|\+4|\+2/.test(text))weekly.progress.powers=(weekly.progress.powers||0)+1;persistWeekly();}
  function harvest(){safe('harvest',()=>{if(weekly.week!==weekKey()){weekly={week:weekKey(),progress:{wins:0,uno:0,reverse:0,powers:0},processed:[]};persistWeekly()}const events=window.DBT_MULTIPLAYER_V1?.events?.()||[];for(const item of events)countEvent(item);})}

  const top=document.querySelector('.top-actions')||document.querySelector('.flex-top');top?.appendChild(weeklyBtn);
  if(socket?.on){socket.on(mode==='classic'?'s_sync_state':'f_state',rememberRoom)}
  setInterval(()=>{mountRecent();rememberRoom();harvest()},2500);
  mountRecent();rememberRoom();renderRecent();harvest();
})();
