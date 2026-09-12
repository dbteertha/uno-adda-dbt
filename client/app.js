const $=(id)=>document.getElementById(id);
const socket=io({autoConnect:false});
let state=null,saved=null,armed=false,choice=null,offset=0,toastTimer,selectedAvatar=localStorage.getItem('uno-avatar')||'😎',lastEventId=null,soundOn=localStorage.getItem('uno-sound')!=='off',lastRevision=-1,trollTimer=null,devilRevealData=null,devilRevealTimer=null;
try{saved=JSON.parse(localStorage.getItem('uno-session')||'null')}catch{}

const TROLLS=[
  {id:'think-fast',text:'এত ভাবিস কেন? দাবা নাকি? 💀'},
  {id:'plus4',text:'+4 খাও ভাই! 😂'},
  {id:'uno-soon',text:'UNO আসতেছে, দোয়া কইরো 👀'},
  {id:'skill-low',text:'কপাল ভালো, স্কিল কম 😏'},
  {id:'caught',text:'ধরা খাইছো বস! 😈'},
  {id:'shop',text:'কার্ড তুলতে তুলতে দোকান খুলবা নাকি? 😂'},
  {id:'turn',text:'তোমার চাল, ঘুমাইও না 😴'},
  {id:'mercy',text:'আমি নিরীহ মানুষ, +4 দিও না 🥺'},
  {id:'watch',text:'দেখে খেল, পরে কান্দিস না 😂'},
  {id:'stadium',text:'স্টেডিয়াম গরম! 🔥'}
];
const ROOM_SOUNDS=[
  {id:'headphone-1',label:'headphone 1',src:'/sounds/headphone-1.mp3'},
  {id:'kemon-aso',label:'kemon aso',src:'/sounds/kemon-aso.mp3'},
  {id:'fast',label:'fast',src:'/sounds/fast.mp3'},
  {id:'gorib',label:'gorib',src:'/sounds/gorib.mp3'},
  {id:'rag-korla',label:'rag korla',src:'/sounds/rag-korla.mp3'},
  {id:'dhoka',label:'dhoka',src:'/sounds/dhoka.mp3'},
  {id:'khoma',label:'khoma',src:'/sounds/khoma.mp3'},
  {id:'big-fan-bhai',label:'big-fan-bhai',src:'/sounds/big-fan-bhai.mp3'},
  {id:'ashraful',label:'ashraful',src:'/sounds/ashraful.mp3'},
  {id:'uhuhu-babare',label:'uhuhu babare',src:'/sounds/uhuhu-babare.mp3'},
  {id:'vul',label:'vul',src:'/sounds/vul.mp3'}
];
const roomAudio=new Map(ROOM_SOUNDS.map(s=>[s.id,new Audio(s.src)]));
let soundCooldownUntil=0,trollCooldownUntil=0;
const handNodes=new Map();
const knownCardIdentity=new Map();

const COMMENTATORS=[
  '🎙️ Mr Bean Stadium','💪 John Cena Commentary Box','🎩 Charlie Chaplin Press Box','🪨 The Rock Arena Desk','🐐 Messi VIP Box','⚡ Usain Bolt Speed Desk','🤖 বট মামা স্টুডিও','😂 DBT Comedy Box'
];
const COMMENTS={
  play:[
    n=>`${n} কার্ড নামাল এমন ভাব নিয়ে, যেন John Cena-ও বলবে: এই চাল দেখা যাচ্ছে না! 😂`,
    n=>`${n} ঠান্ডা মাথায় কার্ড ফেলল—Mr Bean হলে এখন টেডি নিয়ে চিন্তায় বসে যেত! 🧸😂`,
    n=>`${n} একদম সিনেমার হিরোর মতো কার্ড নামাল। স্কিল নাকি নাটক—দর্শক বিভক্ত! 🎬😂`,
    n=>`${n} চাল দিল। Charlie Chaplin হলে কথা না বলেই পালিয়ে যেত! 🎩💀`
  ],
  draw:[
    n=>`${n} আবার কার্ড তুলল! The Rock জিজ্ঞেস করছে—ডেকের গন্ধ পাচ্ছো নাকি? 😂`,
    n=>`${n}-র হাতে নতুন অতিথি! Mr Bean বলছে, আরেকটা নাও, কালেকশন পূর্ণ হোক! 💀`,
    n=>`${n} ড্র করল—কার্ডের দোকান খোলার লাইসেন্স প্রায় রেডি! 🏪😂`,
    n=>`ওরে বাবা! ${n} আবার ডেকের কাছে গেল। সম্পর্কটা সন্দেহজনক! 👀😂`
  ],
  draw2:[
    (a,b)=>`${a} দিল +2! ${b}-র হাতে দুইটা নতুন দুঃখ—John Cena স্টাইলে সরাসরি ধাক্কা! 💪😂`,
    (a,b)=>`+2 এসে ${b}-র দরজায়! ${a} আজকে কুরিয়ার সার্ভিস খুলেছে! 📦💀`,
    (a,b)=>`${a} দুইটা কার্ড পাঠাল ${b}-কে—Mr Bean হলে ভুল ঠিকানায়ও এমন পার্সেল পাঠাত না! 😂`
  ],
  draw4:[
    (a,b)=>`চারটা! চারটা! ${a} আজ ${b}-র সাথে বন্ধুত্বের চুক্তি বাতিল করেছে! 💀🔥`,
    (a,b)=>`${a} দিল +4! ${b}-র হাতে এখন এত কার্ড, John Cena-ও তুলতে জিম লাগাবে! 💪😂`,
    (a,b)=>`+4 আঘাত! ${b}, Mr Bean-এর টেডি ধরে বসে থাকো—সময় কঠিন! 🧸😭`,
    (a,b)=>`${a} +4 মারল! The Rock eyebrow উঠিয়ে বলছে—এটা ব্যক্তিগত হয়ে গেল! 🤨🔥`
  ],
  skip:[
    (a,b)=>`${a} বলল: ${b}, আজকে দর্শক হও! চাল বাতিল 😂`,
    (a,b)=>`${b}-র চাল গায়েব! Mr Bean-এর গাড়ির চাবির মতো আর খুঁজে পাওয়া যাচ্ছে না! 🚗💀`,
    (a,b)=>`${a} স্কিপ দিল—${b} বেঞ্চে! John Cena ম্যাচে ঢোকার আগেই ঘণ্টা বাজল 😂`
  ],
  reverse:[
    a=>`${a} রিভার্স দিল! রাস্তা এমন ঘুরল, Google Maps-ও বিভ্রান্ত! 🔄😂`,
    a=>`${a} খেলা উল্টে দিল—Charlie Chaplin এখন উল্টো দিকেই হাঁটছে! 🎩🔥`,
    a=>`রিভার্স! The Rock-এর eyebrow-ও দিক বদলেছে! 🤨🔄`
  ],
  wild:[
    a=>`${a} রঙ বদলে দিল! এখন নিয়মও তার, মুডও তার—Mr Bean শুধু তাকিয়ে আছে 😂`,
    a=>`${a} Wild খেলল—রঙ বদলেছে, বন্ধুত্বের রঙও বদলাবে নাকি? 🌈💀`
  ],
  color:[a=>`${a} রঙ বেছে নিল। স্টেডিয়ামের লাইটও যেন সেই রঙে জ্বলে উঠল! 🎨🔥`],
  uno:[
    a=>`ইউনোওওও! ${a}-র হাতে একটাই! John Cena entrance music কোথায়?! 🚨🔥`,
    a=>`${a} UNO-র দরজায়! Mr Bean এখন চুপচাপ টেডি লুকাচ্ছে! 🧸😂`,
    a=>`একটা কার্ড! একটা স্বপ্ন! ${a} এখন স্টেডিয়ামের মূল চরিত্র! 🏟️🔥`
  ],
  catch:[
    (a,b)=>`${a} ধরে ফেলেছে ${b}-র UNO ভুল! VAR চেক সম্পন্ন—দুই কার্ড জরিমানা! 😂`,
    (a,b)=>`${b} UNO ভুলেছে! ${a} এমন ধরেছে, John Cena-র submission move! 💪💀`
  ],
  pass:[a=>`${a} কার্ড রেখে পাশ দিল। রহস্য এত বেশি, Sherlock-ও ছুটি নিত! 👀😂`],
  timeout:[
    a=>`${a} এত ভাবল যে Mr Bean দুইটা সিনেমা দেখে ফেলল! সময় শেষ 😂`,
    a=>`সময় শেষ! ${a}, এটা UNO ভাই—বিশ্বকাপের পেনাল্টি না! ⏱️💀`
  ],
  win:[
    a=>`খেলা শেষ! ${a} চ্যাম্পিয়ন! John Cena entrance, Mr Bean dance, The Rock eyebrow—সব একসাথে! 🏆😂🔥`,
    a=>`${a} জিতে গেছে! স্টেডিয়াম এমন গরম, Charlie Chaplin-ও কথা বলা শুরু করবে! 🏆💀`
  ],
  devil:[
    a=>`😈 ${a} ডেভিল কার্ড নামিয়েছে! Mr Bean-এর চোখ বড়—এক সেকেন্ডে সবার গোপন কার্ড স্ক্যান! 😂`,
    a=>`ডেভিল নামল! ${a} এখন John Cena-র মতো বলছে—তোমাদের কার্ড I CAN SEE YOU! 😈💀`,
    a=>`${a} ডেভিল চাল দিল—The Rock eyebrow উঠল, গোপন তথ্য ফাঁস মাত্র এক সেকেন্ড! 🤨😈`
  ],
  taunt:[(a,_b,v)=>`${a}: ${v}`]
};

function save(v){saved=v;try{v?localStorage.setItem('uno-session',JSON.stringify(v)):localStorage.removeItem('uno-session')}catch{}}
function notify(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200)}
function emit(e,d={}){if(!socket.connected){notify('নেটওয়ার্ক গেছে ভাই… আবার ধরার চেষ্টা করছি 😭');return}socket.emit(e,d)}
function clearSession(){save(null);state=null;armed=false;choice=null;lastRevision=-1;lastEventId=null;devilRevealData=null;clearTimeout(devilRevealTimer);knownCardIdentity.clear();for(const n of handNodes.values())n.remove();handNodes.clear();for(const id of ['results','colors','history-dialog'])if($(id).open)$(id).close();render()}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function speak(text){
  if(!soundOn||!('speechSynthesis'in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text.replace(/[😂😭💀😈🔥👀😎🚨🏆🧸💪🎩🤨🏟️🎬📦🏪🚗🌈🎨]/g,''));
  u.lang='bn-BD';u.rate=1.08;u.pitch=1.04;u.volume=.9;speechSynthesis.speak(u);
}
function beep(kind='play'){if(!soundOn)return;try{const A=window.AudioContext||window.webkitAudioContext;const c=new A(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);const map={play:420,draw:260,alert:720,win:880,troll:560};o.frequency.value=map[kind]||420;g.gain.setValueAtTime(.05,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.16);o.start();o.stop(c.currentTime+.17)}catch{}}
function commentary(text,voice=true){$('commentator-name').textContent=pick(COMMENTATORS);$('commentary-text').textContent=text;if(voice)speak(text)}
function eventComment(ev){
  if(!ev||ev.id===lastEventId)return;lastEventId=ev.id;
  const list=COMMENTS[ev.type];let text='';
  if(list){const fn=pick(list);text=fn(ev.actor,ev.target,ev.value)}
  if(ev.type==='uno'&&ev.value==='missed')text=`${ev.actor} UNO বলতে ভুলে গেছে! Mr Bean-ও এত বড় ভুল করে না ভাই! ধরো ধরো! 😂`;
  if(text){commentary(text,true);beep(ev.type==='win'?'win':ev.type==='draw4'?'alert':'play');if(['draw4','uno','win','devil'].includes(ev.type))reaction(ev.type==='draw4'?'💀':ev.type==='uno'?'🚨':ev.type==='devil'?'😈':'🏆')}
}
function reaction(e){const p=$('reaction-pop');p.textContent=e;p.hidden=false;p.style.animation='none';void p.offsetWidth;p.style.animation='reaction 1.8s ease forwards';setTimeout(()=>p.hidden=true,1800)}
function showTroll(sender,text){
  const b=$('troll-banner');b.innerHTML=`<small>⚡ ${escapeHtml(sender)} ট্রল ছুঁড়েছে</small><b>${escapeHtml(text)}</b>`;b.hidden=false;b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');clearTimeout(trollTimer);trollTimer=setTimeout(()=>{b.hidden=true},3200);beep('troll');
}

socket.on('connect',()=>{$('network').textContent='🟢 কানেক্টেড';if(saved)emit('c_reconnect',saved);render()});
socket.on('disconnect',()=>{$('network').textContent='🟠 আবার কানেক্ট হচ্ছে…';render()});
socket.on('connect_error',()=>{$('network').textContent='🔴 কানেকশন সমস্যা'});
socket.on('s_room_created',d=>save(d));
function validateCardIdentity(cards){
  for(const c of cards){const sig=`${c.color}:${c.value}`,old=knownCardIdentity.get(c.id);if(old&&old!==sig){console.error('UNO card identity changed',c.id,old,sig);notify('⚠️ কার্ডের পরিচয় বদলানোর চেষ্টা ধরা পড়েছে—পুরনো ডাটা নেওয়া হয়নি');return false}knownCardIdentity.set(c.id,sig)}return true;
}
function validatePublicCounts(d){for(const p of d.players){if(!Number.isInteger(p.cardCount)||p.cardCount<0||p.cardCount>110){console.error('Invalid public card count',p);return false}}return true}
socket.on('s_sync_state',d=>{
  // Never let an older snapshot overwrite a newer board. This is especially important after reconnects/mobile network switches.
  if(typeof d.revision!=='number'||d.revision<lastRevision){console.warn('Ignored stale UNO snapshot',d.revision,lastRevision);return}
  if(!validateCardIdentity(d.myHand)||!validatePublicCounts(d))return;
  const prev=state;lastRevision=d.revision;state=d;offset=d.serverNow-Date.now();
  if(!state.canCallUno||prev?.myHand.map(c=>c.id).join()!==state.myHand.map(c=>c.id).join())armed=false;
  render();eventComment(d.lastEvent);
});
socket.on('s_error',d=>notify(d.message));
socket.on('s_troll_reaction',d=>showTroll(d.senderName,d.text));
socket.on('s_sound_reaction',d=>{const item=ROOM_SOUNDS.find(x=>x.id===d.soundId);if(!item)return;const a=roomAudio.get(item.id);if(soundOn&&a){try{a.currentTime=0;const play=a.play();if(play?.catch)play.catch(()=>notify('🔊 সাউন্ড চালাতে একবার স্ক্রিনে ট্যাপ করো'));}catch{}}notify(`🔊 ${d.senderName}: ${item.label}`)});
socket.on('s_devil_reveal',d=>{devilRevealData=d.players||[];const f=$('devil-flash');f.hidden=false;reaction('😈');renderOpponents();clearTimeout(devilRevealTimer);devilRevealTimer=setTimeout(()=>{devilRevealData=null;f.hidden=true;renderOpponents()},Math.max(250,Math.min(1500,d.durationMs||1000)));});
socket.on('s_session_expired',clearSession);socket.on('s_session_replaced',()=>{clearSession();notify('এই সেশন অন্য ট্যাব/ডিভাইসে খুলেছে।');socket.disconnect()});

function setAvatar(a){selectedAvatar=a;localStorage.setItem('uno-avatar',a);document.querySelectorAll('.avatar').forEach(x=>x.classList.toggle('active',x.textContent===a))}
document.querySelectorAll('.avatar').forEach(b=>b.onclick=()=>setAvatar(b.textContent));setAvatar(selectedAvatar);
$('create').addEventListener('submit',e=>{e.preventDefault();const displayName=$('name').value.trim();if(displayName)emit('c_create_room',{displayName,avatar:selectedAvatar})});
$('bot-play').onclick=()=>{const displayName=$('name').value.trim();if(!displayName){$('name').focus();return notify('বটকে হারাতে হলে আগে নাম দাও বস 🤖😂')}emit('c_create_bot_room',{displayName,avatar:selectedAvatar});notify('বট মামা টেবিলে আসছে… 🤖🔥')};
$('join').addEventListener('submit',e=>{e.preventDefault();const displayName=$('name').value.trim();if(!displayName){$('name').focus();return notify('আগে নাম দাও বস 😄')}emit('c_join_room',{displayName,avatar:selectedAvatar,roomCode:$('code').value.trim().toUpperCase()})});
$('code').addEventListener('input',()=> $('code').value=$('code').value.toUpperCase());
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(state.roomCode);notify('রুম কোড কপি হয়েছে 📋')}catch{notify(`রুম কোড: ${state.roomCode}`)}};
$('share').onclick=async()=>{const text=`UNO আড্ডায় ঢুকো 😂 রুম কোড: ${state.roomCode}\n${location.origin}`;try{if(navigator.share)await navigator.share({title:'UNO আড্ডা',text});else{await navigator.clipboard.writeText(text);notify('ইনভাইট কপি হয়েছে 📤')}}catch{}};
$('ready').onclick=()=>emit('c_toggle_ready',{isReady:!state.players.find(p=>p.isMe).isReady});
$('draw').onclick=()=>emit('c_draw_card');$('pass').onclick=()=>emit('c_pass_turn');$('catch').onclick=()=>emit('c_catch_uno');$('uno').onclick=()=>{armed=!armed;render()};$('rematch').onclick=()=>emit('c_request_rematch');
document.querySelectorAll('.leave').forEach(el=>el.onclick=()=>{if(state?.status==='PLAYING'&&!confirm('সত্যিই বের হবে? ম্যাচ ছেড়ে দিলে হার ধরা হতে পারে 😅'))return;emit('c_leave_room')});
$('history-btn').onclick=()=>{$('history-dialog').showModal();renderHistory()};
$('sound-toggle').onclick=()=>{soundOn=!soundOn;localStorage.setItem('uno-sound',soundOn?'on':'off');$('sound-toggle').textContent=soundOn?'🔊':'🔇';if(soundOn)commentary('সাউন্ড আবার চালু! স্টেডিয়ামের মাইক গরম 🎙️',true)};$('sound-toggle').textContent=soundOn?'🔊':'🔇';
$('theme-toggle').onclick=()=>{document.body.classList.toggle('light');const l=document.body.classList.contains('light');localStorage.setItem('uno-theme',l?'light':'dark');$('theme-toggle').textContent=l?'☀️':'🌙'};if(localStorage.getItem('uno-theme')==='light'){document.body.classList.add('light');$('theme-toggle').textContent='☀️'}

const symbols={SKIP:'⊘',REVERSE:'↻',DRAW_TWO:'+2',WILD:'W',WILD_DRAW_FOUR:'+4',DEVIL:'😈'};
function cardElement(card,clickable=false){const el=document.createElement(clickable?'button':'div');const corner=document.createElement('small');const face=document.createElement('span');face.className='face';const bottom=document.createElement('small');bottom.className='bottom';el.append(corner,face,bottom);updateCardElement(el,card);return el}
function updateCardElement(el,card){
  // The DOM node is permanently keyed to card.id. Only visual state for that exact id is refreshed.
  if(el.dataset.cardId&&el.dataset.cardId!==card.id)throw new Error('Card DOM identity mismatch');
  el.className=`uno-card ${card.color}${card.value==='DEVIL'?' devil-card':''}`;el.setAttribute('aria-label',`${card.color} ${card.value}`);el.dataset.value=card.value;const value=symbols[card.value]||card.value;el.children[0].textContent=value;el.children[1].textContent=value;el.children[2].textContent=value;el.dataset.cardId=card.id;
}
function renderHand(){
  const hand=$('hand'),keep=new Set(state.myHand.map(c=>c.id));
  for(const [id,node] of handNodes){if(!keep.has(id)){node.remove();handNodes.delete(id)}}
  const frag=document.createDocumentFragment();
  for(const card of state.myHand){let el=handNodes.get(card.id);if(!el){el=cardElement(card,true);handNodes.set(card.id,el)}else updateCardElement(el,card);const playable=socket.connected&&!state.paused&&state.status==='PLAYING'&&state.playableCardIds.includes(card.id);el.disabled=!playable;el.classList.toggle('playable',playable);el.onclick=()=>play(card);frag.appendChild(el)}
  hand.replaceChildren(frag);
}
function play(card){if(card.color==='WILD'){choice={cardId:card.id,drawn:!!state.pendingDrawnCard};$('colors').showModal()}else submitCard(card.id,undefined,!!state.pendingDrawnCard)}
function submitCard(id,color,drawn){drawn?emit('c_play_drawn',{chosenColor:color,calledUno:armed}):emit('c_play_card',{cardId:id,chosenColor:color,calledUno:armed});armed=false}
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{const chosenColor=b.dataset.color;if(state?.needsStartingColor)emit('c_choose_start_color',{chosenColor});else if(choice)submitCard(choice.cardId,chosenColor,choice.drawn);choice=null;$('colors').close()});
$('cancel-color').onclick=()=>{choice=null;$('colors').close()};$('colors').addEventListener('cancel',e=>{if(state?.needsStartingColor)e.preventDefault();else choice=null});

TROLLS.forEach(item=>{const b=document.createElement('button');b.className='troll-btn';b.textContent=item.text;b.onclick=()=>{const now=Date.now();if(now<trollCooldownUntil)return notify('ট্রল একটু আস্তে ভাই 😂');trollCooldownUntil=now+1000;emit('c_troll_reaction',{trollId:item.id})};$('quick-list').append(b)});
ROOM_SOUNDS.forEach(item=>{const b=document.createElement('button');b.className='sound-btn';b.textContent=item.label;b.onclick=()=>{const now=Date.now();if(now<soundCooldownUntil)return notify('একটু অপেক্ষা করো ভাই 😅');soundCooldownUntil=now+1800;emit('c_sound_reaction',{soundId:item.id})};$('sound-list').append(b)});

function playerRow(p){const el=document.createElement('div');el.className='player-row';el.innerHTML=`<strong>${p.avatar} ${escapeHtml(p.displayName)}${p.isBot?' 🤖 BOT':''}${p.isMe?' (তুমি)':''}</strong><span>${p.isReady?'✅ রেডি':'⏳ অপেক্ষা'}</span>`;return el}
function renderOpponents(){
  const box=$('opponent-hands');if(!box||!state)return;
  const revealBySeat=new Map((devilRevealData||[]).map(x=>[x.seat,x]));
  const opponents=state.players.filter(p=>!p.isMe);
  box.replaceChildren(...opponents.map((p,idx)=>{
    const zone=document.createElement('section');zone.className=`opponent-zone ${p.isCurrent?'current':''}`;
    const head=document.createElement('div');head.className='opponent-label';head.innerHTML=`<span>${p.avatar} <b>${escapeHtml(p.displayName)}</b>${p.isBot?' 🤖':''}</span><span>${p.connected?'🟢':'🔴'} · ${p.cardCount} কার্ড</span>`;
    const row=document.createElement('div');row.className='opponent-hand';
    const reveal=revealBySeat.get(p.seat);
    if(reveal){
      zone.classList.add('revealed');
      reveal.cards.forEach((c,i)=>{const el=cardElement({id:`reveal-${p.seat}-${i}`,color:c.color,value:c.value});el.classList.add('opponent-reveal-card');row.append(el)});
    }else{
      const shown=Math.min(p.cardCount,12);
      for(let i=0;i<shown;i++){const back=document.createElement('div');back.className='mini-card-back';back.innerHTML='<span>DBT</span>';row.append(back)}
      if(p.cardCount>shown){const more=document.createElement('div');more.className='more-cards';more.textContent=`+${p.cardCount-shown}`;row.append(more)}
    }
    zone.append(head,row);return zone;
  }));
}
function renderPlayers(){renderOpponents()}
function renderHistory(){if(!state)return;$('history-list').replaceChildren(...(state.history.length?state.history.map(h=>{const d=document.createElement('div');d.className='history-item';d.textContent=`রাউন্ড ${h.round} · ${h.winnerAvatar} ${h.winnerName} জিতেছে · +${h.points} পয়েন্ট`;return d}):[Object.assign(document.createElement('p'),{textContent:'এখনও ইতিহাস তৈরি হয়নি 😄'})]))}

function render(){
  const lobby=state?.status==='LOBBY';$('menu').hidden=!!state;$('lobby').hidden=!lobby;$('board').hidden=!state||lobby;if(!state)return;
  const me=state.players.find(p=>p.isMe),enabled=socket.connected&&!state.paused&&state.status==='PLAYING';
  if(lobby){$('copy').textContent=state.roomCode;$('lobby-players').replaceChildren(...state.players.map(playerRow));$('ready').textContent=me.isReady?'রেডি ✅ · বদলাতে চাপো':'আমি রেডি 😎';$('ready').disabled=!socket.connected;return}
  $('room-label').textContent=`রুম ${state.roomCode}`;$('round-label').textContent=`· রাউন্ড ${state.round}`;renderPlayers();
  const currentPlayer=state.players.find(p=>p.isCurrent);
  $('turn').textContent=state.status==='ROUND_OVER'?'রাউন্ড শেষ 🏁':!enabled?'খেলা থেমে আছে ⏸️':state.isMyTurn?'তোমার চাল বস 😎':currentPlayer?.isBot?'বট মামা হিসাব করছে… 🤖🧠':'অন্যজন ভাবছে… 👀';$('turn').classList.toggle('mine',state.isMyTurn&&enabled);
  $('draw').disabled=!enabled||!state.isMyTurn||!!state.pendingDrawnCard||state.needsStartingColor;$('draw-count').textContent=`ডেকে ${state.drawPileCount} কার্ড`;$('discard').replaceChildren(...(state.topDiscardCard?[cardElement(state.topDiscardCard)]:[]));
  const bn={RED:'🔴 লাল',YELLOW:'🟡 হলুদ',GREEN:'🟢 সবুজ',BLUE:'🔵 নীল',WILD:'🌈 রঙ বাছাই'};$('active-color').textContent=bn[state.activeColor];$('direction').textContent=state.direction===1?'↻ ঘড়ির দিকে':'↺ উল্টো দিকে';
  $('my-avatar').textContent=state.myAvatar;$('my-name').textContent=state.myName;$('hand-count').textContent=` · ${state.myHand.length}টা কার্ড`;$('uno').disabled=!enabled||!state.canCallUno;$('uno').setAttribute('aria-pressed',String(armed));$('uno').textContent=armed?'UNO রেডি! 🚨':'UNO! 🚨';$('catch').hidden=!state.canCatchOpponent;$('catch').disabled=!enabled;$('pass').hidden=!state.pendingDrawnCard;$('pass').disabled=!enabled;
  renderHand();
  $('hint').textContent=state.pendingDrawnCard?'তোলা কার্ড খেলো, না হলে রেখে পাশ দাও।':armed?'UNO লক করা আছে—এখন কার্ড নামাও! 🚨':state.canCallUno?'দুইটা কার্ড! আগে UNO চাপো, তারপর কার্ড নামাও।':state.isMyTurn?'হাইলাইট করা কার্ড খেলো, না হলে ড্র করো।':'চোখ খোলা রাখো—কখন কী হয় বলা যায় না 😂';
  if(state.needsStartingColor&&enabled){choice=null;$('cancel-color').hidden=true;if(!$('colors').open)$('colors').showModal()}else{$('cancel-color').hidden=false;if(choice&&(!enabled||!state.playableCardIds.includes(choice.cardId))){choice=null;$('colors').close()}if(!choice&&$('colors').open)$('colors').close()}
  if(state.status==='ROUND_OVER'){$('winner').textContent=`${state.winnerAvatar||'🏆'} ${state.winnerName} জিতে গেছে!`;$('result-reason').textContent=state.resultReason==='forfeit'?'প্রতিপক্ষ চলে যাওয়ায় ম্যাচ শেষ।':'কার্ড শেষ—কাজ শেষ! 🔥';$('scores').replaceChildren(...[...state.players].sort((a,b)=>b.score-a.score).map(p=>{const el=document.createElement('div');el.className='score-row';el.innerHTML=`<span>${p.avatar} ${escapeHtml(p.displayName)}</span><b>${p.score} pts · 🏆 ${p.wins}</b>`;return el}));$('rematch').disabled=me.rematchRequested||state.paused||!socket.connected;$('rematch').textContent=me.rematchRequested?'সবাইকে অপেক্ষা করছি… 👀':'রিভেঞ্জ চাই 😈';if(!$('results').open)$('results').showModal()}else if($('results').open)$('results').close();
  updateClocks();
}
function updateClocks(){if(!state)return;const now=Date.now()+offset,sec=state.turnDeadline?Math.max(0,Math.ceil((state.turnDeadline-now)/1000)):0;$('clock').textContent=state.turnDeadline?`⏱️ ${sec}s`:'';$('clock').classList.toggle('warning',sec>0&&sec<=7);const disconnected=state.status==='PLAYING'&&(!socket.connected||state.paused);$('disconnect').hidden=!disconnected;if(disconnected)$('disconnect').textContent=!socket.connected?'নেট গেছে! আবার ধরছি… 📡':`কেউ ডিসকানেক্টেড। ফিরতে সময় ${Math.max(0,Math.ceil(((state.reconnectDeadline||now)-now)/1000))}s`;if(state.unoDeadline&&now>=state.unoDeadline)$('catch').disabled=true}
setInterval(updateClocks,100);socket.connect();
if('serviceWorker'in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}
