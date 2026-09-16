(() => {
  if (window.DBT_EFFECTS_V1) return;
  window.DBT_EFFECTS_V1 = true;

  const root = document.documentElement;
  const ui = window.DBT_UI || { reducedMotion:false, lowPower:false, haptic:()=>{}, sound:{tap:()=>{},impact:()=>{},confirm:()=>{}}, emit:()=>{} };
  const reduced = !!ui.reducedMotion;
  const lowPower = !!ui.lowPower;
  let lastEffect = '';
  let lastPowerText = '';
  let lastFlexText = '';
  let cleanupTimer = 0;

  const LABELS = {
    reverse:['↻','REVERSE'], skip:['⊘','SKIP'], draw2:['+2','DRAW TWO'], draw4:['+4','DRAW FOUR'], wild:['🌈','WILD'], devil:['😈','DEVIL'],
    magnet:['🧲','MAGNET'], shield:['🛡️','SHIELD'], freeze:['❄️','TIME FREEZE'], robbery:['🥷','ROBBERY'], flex:['⚡','FLEX POWER'], challenge:['⚔️','CHALLENGE']
  };
  const GLOWS = {
    reverse:'#57ddff55',skip:'#ffe36a55',draw2:'#ff795b55',draw4:'#ff4f9d66',wild:'#8d7cff55',devil:'#c84dff66',
    magnet:'#59e5ff66',shield:'#6da9ff66',freeze:'#aeefff66',robbery:'#bd5cff66',flex:'#70f2b055',challenge:'#ff657455'
  };

  function flash(kind, subtitle='SPECIAL MOVE') {
    if (reduced || !LABELS[kind]) return;
    document.querySelectorAll('.dbt-special-fx').forEach(el=>el.remove());
    const [icon,label] = LABELS[kind];
    const layer = document.createElement('div');
    layer.className = 'dbt-special-fx';
    layer.dataset.kind = kind;
    layer.style.setProperty('--fx-glow', GLOWS[kind] || '#6ce1ff55');
    const emblem = document.createElement('div');
    emblem.className = 'dbt-special-emblem';
    emblem.innerHTML = `<b>${icon}<br>${label}</b><small>${subtitle}</small>`;
    layer.appendChild(emblem);
    const particles = lowPower ? 6 : 14;
    for (let i=0;i<particles;i++) {
      const p=document.createElement('i');
      p.className='dbt-fx-particle';
      p.style.setProperty('--a',`${i*(360/particles)}deg`);
      p.style.color = kind==='skip' ? '#ffe36a' : kind==='draw2' ? '#ff7b61' : kind==='draw4'||kind==='devil'||kind==='robbery' ? '#e36cff' : kind==='shield' ? '#78b6ff' : kind==='freeze' ? '#bff6ff' : '#68e5ff';
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    clearTimeout(cleanupTimer);
    cleanupTimer=setTimeout(()=>layer.remove(),1000);
    root.dataset.dbtPower = ['magnet','shield','freeze','robbery'].includes(kind) ? kind : root.dataset.dbtPower;
    if (['draw4','devil','robbery','freeze'].includes(kind)) ui.haptic?.([18,24,30]); else ui.haptic?.(14);
    if (['draw4','devil','robbery'].includes(kind)) ui.sound?.impact?.(); else ui.sound?.confirm?.();
    ui.emit?.('specialfx',{kind,subtitle});
  }

  function inferPower(text='') {
    const t=String(text).toUpperCase();
    if (t.includes('MAGNET')) return 'magnet';
    if (t.includes('SHIELD')) return 'shield';
    if (t.includes('TIME FREEZE') || t.includes('FREEZE')) return 'freeze';
    if (t.includes('ROBBERY')) return 'robbery';
    return '';
  }

  function onPowerText(text) {
    const clean=String(text||'').trim();
    if (!clean || clean===lastPowerText || /POWER SYSTEM ONLINE/i.test(clean)) return;
    lastPowerText=clean;
    const kind=inferPower(clean);
    if (!kind) return;
    root.dataset.dbtPower=kind;
    flash(kind,/BLOCK|BLOCKED/i.test(clean)?'BLOCKED':'DBT POWER CARD');
    setTimeout(()=>{ if(root.dataset.dbtPower===kind) delete root.dataset.dbtPower; },1150);
  }

  function onRootEffect() {
    const kind=root.dataset.dbtEffect||'';
    if (!kind || kind===lastEffect || kind==='play') return;
    lastEffect=kind;
    if (LABELS[kind]) flash(kind,'SPECIAL CARD');
    setTimeout(()=>{ if(lastEffect===kind) lastEffect=''; },900);
  }

  function onFlexAction(text) {
    const clean=String(text||'').trim();
    if (!clean || clean===lastFlexText) return;
    lastFlexText=clean;
    const upper=clean.toUpperCase();
    if (upper.includes('CHALLENGE')) return flash('challenge','FLEX DUEL');
    if (upper.includes('FLEX')) return flash('flex','POWER SIDE');
    if (upper.includes('POWER') && (upper.includes('ON')||upper.includes('OFF'))) return flash('flex','POWER SHIFT');
  }

  function observeText(el, fn) {
    if (!el) return;
    let last=el.textContent||'';
    new MutationObserver(()=>{
      const now=el.textContent||'';
      if(now!==last){last=now;fn(now)}
    }).observe(el,{childList:true,subtree:true,characterData:true});
  }

  function observeVisibility(el, kind, subtitle) {
    if (!el) return;
    let was=!el.hidden;
    new MutationObserver(()=>{
      const now=!el.hidden;
      if(now&&!was) flash(kind,subtitle);
      was=now;
    }).observe(el,{attributes:true,attributeFilter:['hidden','class']});
  }

  function loadStagingAudio() {
    const stable = window.DBT_STABILITY;
    const stagingHost = location.hostname === 'addawithdbt-staging.onrender.com';
    const forced = new URLSearchParams(location.search).get('dbtAudio') === '1';
    if (!stable || (!stagingHost && !forced)) return;
    stable.flags.audio = true;
    void stable.script('premium-audio', '/premium-audio.js?v=staging-1', {
      feature:'audio', selector:'script[data-dbt-premium-audio]', ready:() => !!window.DBT_AUDIO, dataset:{ dbtPremiumAudio:'1' }
    });
  }

  function boot() {
    new MutationObserver(onRootEffect).observe(root,{attributes:true,attributeFilter:['data-dbt-effect']});
    observeText(document.getElementById('classic-power-status'),onPowerText);
    observeText(document.getElementById('classic-shield-state'),onPowerText);
    observeText(document.getElementById('action-log'),onFlexAction);
    observeText(document.getElementById('power-pill'),(text)=>{
      if (/POWER\s+(ON|OFF)/i.test(text)) onFlexAction(text);
    });
    observeVisibility(document.getElementById('devil-flash'),'devil','ONE-SECOND REVEAL');
    observeVisibility(document.getElementById('challenge'),'challenge','DRAW FOUR DECISION');

    const robbery=document.querySelector('.robbery-dialog');
    if(robbery){
      let was=robbery.open;
      new MutationObserver(()=>{const now=robbery.open;if(now&&!was)flash('robbery','CHOOSE A POWER');was=now}).observe(robbery,{attributes:true,attributeFilter:['open']});
    }

    document.addEventListener('click',(e)=>{
      const power=e.target.closest?.('.classic-power-card');
      if(power && !power.classList.contains('spent')) ui.haptic?.(9);
      const wild=e.target.closest?.('#colors .color-grid button,#play-dialog [data-color]');
      if(wild){ui.haptic?.(11);ui.sound?.confirm?.();}
    },{passive:true});

    onRootEffect();
    const p=document.getElementById('classic-power-status'); if(p) onPowerText(p.textContent);
    loadStagingAudio();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();