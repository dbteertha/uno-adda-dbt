(() => {
  if (window.DBT_PRESENTATION_MODES_V1) return;
  window.DBT_PRESENTATION_MODES_V1 = true;

  const root = document.documentElement;
  const stable = window.DBT_STABILITY;
  const safe = (name, fn) => { try { return fn(); } catch (error) { stable?.record?.(`modes:${name}`, error); return undefined; } };
  const KEY='dbt-presentation-modes-v1';
  const THEMES=['auto','eid','boishakh','winter','halloween','birthday','anniversary','none'];
  let saved={}; try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{}
  const state={ mode:['adaptive','calm','party'].includes(saved.mode)?saved.mode:'adaptive', theme:THEMES.includes(saved.theme)?saved.theme:'auto' };
  let eventTimes=[];

  function seasonalAuto(){
    const d=new Date(),m=d.getMonth()+1,day=d.getDate();
    if(m===4&&day>=10&&day<=20)return'boishakh';
    if(m===10&&day>=24)return'halloween';
    if(m===12)return'winter';
    if(m===9&&day>=10&&day<=20)return'anniversary';
    return'none';
  }
  function apply(){
    root.dataset.dbtPresentation=state.mode;
    root.dataset.dbtSeason=state.theme==='auto'?seasonalAuto():state.theme;
    root.classList.toggle('dbt-calm-mode',state.mode==='calm');
    root.classList.toggle('dbt-party-mode',state.mode==='party');
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
    window.DBT_UI?.emit?.('presentationmode',{...state,resolvedTheme:root.dataset.dbtSeason});
  }
  apply();

  const button=document.createElement('button');button.id='dbt-modes-open';button.type='button';button.textContent='✨';button.title='Presentation modes';button.setAttribute('aria-label','Presentation modes and seasonal themes');
  const host=document.querySelector('.top-actions')||document.querySelector('.flex-top')||document.body;host.appendChild(button);
  const dialog=document.createElement('dialog');dialog.id='dbt-modes-dialog';dialog.innerHTML=`<div class="dbt-modes-shell"><header><div><small>DBT GAMES · TABLE STYLE</small><h2>Match presentation</h2></div><button data-close type="button">✕</button></header><p>These options only change visuals, audio intensity and UI atmosphere. Game rules stay server-authoritative.</p><section><b>ENERGY MODE</b><div class="dbt-mode-grid"><button data-mode="adaptive" type="button">⚡ <span><b>Adaptive</b><small>Raises or suppresses effects based on match activity.</small></span></button><button data-mode="calm" type="button">🌙 <span><b>Calm</b><small>Less motion, commentary and particles.</small></span></button><button data-mode="party" type="button">🎉 <span><b>Party</b><small>More reactions, glow and atmosphere.</small></span></button></div></section><section><b>SEASONAL TABLE</b><div class="dbt-theme-grid"></div></section><section><b>TABLE FOCUS</b><div class="dbt-focus-row"><button data-fullscreen type="button">⛶ FULLSCREEN TABLE</button><button data-exit-fullscreen type="button">EXIT FULLSCREEN</button></div></section></div>`;document.body.appendChild(dialog);
  const themeGrid=dialog.querySelector('.dbt-theme-grid');
  const labels={auto:'AUTO',eid:'🌙 EID',boishakh:'🌺 BOISHAKH',winter:'❄️ WINTER',halloween:'🎃 HALLOWEEN',birthday:'🎂 BIRTHDAY',anniversary:'✨ DBT ANNIVERSARY',none:'CLASSIC'};
  for(const theme of THEMES){const b=document.createElement('button');b.type='button';b.dataset.theme=theme;b.textContent=labels[theme]||theme;b.onclick=()=>{state.theme=theme;apply();sync();};themeGrid.appendChild(b)}
  function sync(){dialog.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));dialog.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===state.theme));}
  button.onclick=()=>{sync();dialog.showModal()};dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});dialog.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;apply();sync();});
  dialog.querySelector('[data-fullscreen]').onclick=()=>safe('fullscreen',async()=>{const target=document.getElementById('board')||document.getElementById('game')||document.documentElement;if(target.requestFullscreen&&!document.fullscreenElement)await target.requestFullscreen();});
  dialog.querySelector('[data-exit-fullscreen]').onclick=()=>safe('exit-fullscreen',async()=>{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen();});

  function activity(){
    const t=performance.now();eventTimes.push(t);eventTimes=eventTimes.filter(x=>t-x<8000);
    if(state.mode!=='adaptive')return;
    const busy=eventTimes.length>=7;root.classList.toggle('dbt-adaptive-busy',busy);root.classList.toggle('dbt-adaptive-quiet',eventTimes.length<=2);
  }
  window.DBT_UI?.bus?.addEventListener('specialfx',activity);window.DBT_UI?.bus?.addEventListener('cardimpactvisual',activity);window.DBT_UI?.bus?.addEventListener('turnlabelchange',activity);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){eventTimes=[];root.classList.remove('dbt-adaptive-busy')}});
  sync();
})();
