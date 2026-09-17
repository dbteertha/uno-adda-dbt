(() => {
  if (window.DBT_DIAGNOSTICS_V1) return;
  window.DBT_DIAGNOSTICS_V1 = true;
  const stable=window.DBT_STABILITY;
  const mode=location.pathname.startsWith('/flex')?'flex':'classic';
  const socket=mode==='flex'?window.DBT_FLEX_SOCKET:window.DBT_CLASSIC_SOCKET;
  const state={fps:0,frameMs:0,longTasks:0,longestTask:0,errors:0,reconnects:0,disconnects:0,lastDisconnect:0};
  let raf=0,lastFrame=0,frameTimes=[],timer=0,hudEnabled=localStorage.getItem('dbt-perf-hud')==='1';

  const button=document.createElement('button');button.id='dbt-diag-open';button.type='button';button.textContent='📈';button.title='Performance diagnostics';button.setAttribute('aria-label','Performance diagnostics');
  const host=document.querySelector('.top-actions')||document.querySelector('.flex-top')||document.body;host.appendChild(button);
  const dialog=document.createElement('dialog');dialog.id='dbt-diag-dialog';dialog.innerHTML=`<div class="dbt-diag-shell"><header><div><small>DBT GAMES · DIAGNOSTICS</small><h2>Runtime health</h2></div><button data-close type="button">✕</button></header><p>Local diagnostics only. This panel does not read card contents or voice audio.</p><div class="dbt-diag-grid"></div><div class="dbt-diag-actions"><button data-hud type="button">SHOW MINI HUD</button><button data-copy type="button">COPY REPORT</button></div><small class="dbt-diag-note">FPS sampling runs only while this panel or the mini HUD is visible.</small></div>`;document.body.appendChild(dialog);
  const hud=document.createElement('div');hud.id='dbt-perf-hud';hud.hidden=!hudEnabled;document.body.appendChild(hud);
  const grid=dialog.querySelector('.dbt-diag-grid');

  function navMetrics(){const n=performance.getEntriesByType?.('navigation')?.[0];const p=performance.getEntriesByName?.('first-contentful-paint')?.[0];return{load:n?Math.round(n.loadEventEnd||n.duration):null,dom:n?Math.round(n.domContentLoadedEventEnd||0):null,fcp:p?Math.round(p.startTime):null}}
  function net(){const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;return{online:navigator.onLine,effective:c?.effectiveType||'unknown',downlink:Number.isFinite(c?.downlink)?`${c.downlink} Mbps`:'—',rtt:Number.isFinite(c?.rtt)?`${c.rtt} ms`:'—',saveData:!!c?.saveData}}
  function memory(){const m=performance.memory;return m?.usedJSHeapSize?`${Math.round(m.usedJSHeapSize/1048576)} MB`:'—'}
  function rows(){const n=navMetrics(),c=net();return[['FPS',state.fps||'—'],['FRAME',state.frameMs?`${state.frameMs.toFixed(1)} ms`:'—'],['LONG TASKS',state.longTasks],['LONGEST TASK',state.longestTask?`${Math.round(state.longestTask)} ms`:'—'],['LOAD',n.load!=null?`${n.load} ms`:'—'],['FCP',n.fcp!=null?`${n.fcp} ms`:'—'],['NETWORK',c.online?c.effective:'offline'],['RTT',c.rtt],['DOWNLINK',c.downlink],['SAVE DATA',c.saveData?'ON':'OFF'],['RECONNECTS',state.reconnects],['DISCONNECTS',state.disconnects],['JS ERRORS',state.errors],['DOM NODES',document.getElementsByTagName('*').length],['JS HEAP',memory()],['MODE',mode.toUpperCase()]]}
  function render(){grid.replaceChildren();for(const [label,value] of rows()){const card=document.createElement('div');const s=document.createElement('small');s.textContent=label;const b=document.createElement('b');b.textContent=String(value);card.append(s,b);grid.appendChild(card)}hud.textContent=`${state.fps||'—'} FPS · ${state.frameMs?state.frameMs.toFixed(1):'—'}ms · ${navigator.onLine?'ONLINE':'OFFLINE'}`;dialog.querySelector('[data-hud]').textContent=hudEnabled?'HIDE MINI HUD':'SHOW MINI HUD'}
  function frame(t){if(lastFrame){const d=t-lastFrame;if(d>0&&d<1000)frameTimes.push(d);if(frameTimes.length>120)frameTimes.shift()}lastFrame=t;if(frameTimes.length){const avg=frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length;state.frameMs=avg;state.fps=Math.max(1,Math.min(120,Math.round(1000/avg)))}raf=requestAnimationFrame(frame)}
  function shouldSample(){return dialog.open||hudEnabled}
  function syncSampling(){if(shouldSample()&&!raf){lastFrame=0;frameTimes=[];raf=requestAnimationFrame(frame)}else if(!shouldSample()&&raf){cancelAnimationFrame(raf);raf=0;lastFrame=0;frameTimes=[]}}
  function startTimer(){if(timer)return;timer=setInterval(()=>{if(shouldSample())render()},1000)}
  button.onclick=()=>{render();dialog.showModal();syncSampling();startTimer()};
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',syncSampling);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  dialog.querySelector('[data-hud]').onclick=()=>{hudEnabled=!hudEnabled;localStorage.setItem('dbt-perf-hud',hudEnabled?'1':'0');hud.hidden=!hudEnabled;render();syncSampling()};
  dialog.querySelector('[data-copy]').onclick=async()=>{const n=navMetrics(),c=net();const report={at:new Date().toISOString(),mode,...state,loadMs:n.load,fcpMs:n.fcp,network:c,domNodes:document.getElementsByTagName('*').length,heap:memory(),userAgent:navigator.userAgent};const text=JSON.stringify(report,null,2);try{await navigator.clipboard.writeText(text);window.DBT_UI?.toast?.('Diagnostics copied ✅')}catch{window.DBT_UI?.toast?.('Could not copy diagnostics')}};
  if('PerformanceObserver'in window){try{const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){state.longTasks++;state.longestTask=Math.max(state.longestTask,entry.duration||0)}});observer.observe({type:'longtask',buffered:true})}catch{}}
  window.addEventListener('error',()=>state.errors++);window.addEventListener('unhandledrejection',()=>state.errors++);
  socket?.on?.('disconnect',()=>{state.disconnects++;state.lastDisconnect=Date.now()});socket?.on?.('connect',()=>{if(state.lastDisconnect)state.reconnects++});
  navigator.connection?.addEventListener?.('change',()=>{if(shouldSample())render()});window.addEventListener('online',render);window.addEventListener('offline',render);
  if(hudEnabled){hud.hidden=false;syncSampling();startTimer();render()}
  window.addEventListener('pagehide',()=>{if(raf)cancelAnimationFrame(raf);if(timer)clearInterval(timer)},{once:true});
  window.DBT_DIAGNOSTICS={snapshot:()=>Object.fromEntries(rows()),open:()=>button.click()};
})();
