(() => {
  if (window.DBT_GAMEFEEL_V1) return;
  window.DBT_GAMEFEEL_V1 = true;

  const root = document.documentElement;
  const ui = window.DBT_UI || { reducedMotion:false, lowPower:false, haptic:()=>{}, sound:{tap:()=>{},impact:()=>{},confirm:()=>{}}, emit:()=>{} };
  const reduced = !!ui.reducedMotion;
  const lowPower = !!ui.lowPower;
  const $ = (s) => document.querySelector(s);
  const visible = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';

  const gameRoot = () => $('#board') || $('#game');
  const table = () => $('.arena') || $('.flex-table');
  const hand = () => $('#hand');
  const drawPile = () => $('#draw') || $('.draw-pile');
  const discard = () => $('#discard') || $('.discard');

  let lastDiscardSig = '';
  let knownHandIds = new Set();
  let lastGameVisible = false;
  let lastTurnText = '';
  let pendingCardFlight = null;
  let impactTimer = 0;
  let observerAttached = false;

  const cardId = (el, index = 0) => el?.dataset?.cardId || el?.dataset?.id || `anon-${index}-${(el?.textContent || '').trim()}`;

  function syncFan() {
    const box = hand();
    if (!box) return;
    const cards = [...box.children].filter((el) => el.matches('button,.uno-card,.flex-card'));
    const count = cards.length;
    const spread = Math.min(8, Math.max(2.4, count * .42));
    cards.forEach((card, i) => {
      const pos = count <= 1 ? 0 : (i / (count - 1)) * 2 - 1;
      card.style.setProperty('--dbt-fan-r', `${(pos * spread).toFixed(2)}deg`);
      card.style.setProperty('--dbt-fan-y', `${(Math.abs(pos) * Math.min(9, count * .45)).toFixed(1)}px`);
    });
  }

  function handIds() {
    const box = hand();
    if (!box) return new Set();
    return new Set([...box.children].map(cardId));
  }

  function animateFromPile(el, pileRect, delay = 0) {
    if (reduced || lowPower || !el || !pileRect || !el.animate) return;
    requestAnimationFrame(() => {
      const dest = el.getBoundingClientRect();
      if (!dest.width || !dest.height) return;
      const dx = pileRect.left + pileRect.width/2 - (dest.left + dest.width/2);
      const dy = pileRect.top + pileRect.height/2 - (dest.top + dest.height/2);
      el.animate([
        { opacity:.18, transform:`translate(${dx}px,${dy}px) scale(.55) rotate(-10deg)` },
        { opacity:1, transform:'translate(0,2px) scale(1.04) rotate(1deg)', offset:.78 },
        { opacity:1, transform:'translate(0,0) scale(1) rotate(0deg)' }
      ], { duration:460, delay, easing:'cubic-bezier(.16,.84,.26,1)' });
    });
  }

  function syncHandMotion() {
    const box = hand();
    if (!box) return;
    const next = handIds();
    const added = [...next].filter((id) => !knownHandIds.has(id));
    const pile = drawPile()?.getBoundingClientRect();
    if (knownHandIds.size && added.length && pile) {
      [...box.children].forEach((el, i) => {
        const id = cardId(el, i);
        if (added.includes(id)) animateFromPile(el, pile, Math.min(180, added.indexOf(id) * 65));
      });
      ui.haptic?.(9);
      ui.emit?.('carddrawvisual', { count:added.length });
    }
    knownHandIds = next;
    syncFan();
  }

  function capturePlayableCard(event) {
    const target = event.target?.closest?.('#hand button,#hand .uno-card,#hand .flex-card');
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    pendingCardFlight = {
      at:Date.now(), rect, html:target.cloneNode(true), id:cardId(target),
    };
  }

  function flyPlayedCard() {
    const pending = pendingCardFlight;
    pendingCardFlight = null;
    if (!pending || Date.now() - pending.at > 2200 || reduced || lowPower) return;
    const target = discard();
    if (!target) return;
    const dest = target.getBoundingClientRect();
    if (!dest.width || !dest.height) return;
    const clone = pending.html;
    clone.removeAttribute('id');
    clone.classList.add('dbt-card-flight');
    Object.assign(clone.style, {
      left:`${pending.rect.left}px`, top:`${pending.rect.top}px`, width:`${pending.rect.width}px`, height:`${pending.rect.height}px`,
    });
    document.body.appendChild(clone);
    const dx = dest.left + dest.width/2 - (pending.rect.left + pending.rect.width/2);
    const dy = dest.top + dest.height/2 - (pending.rect.top + pending.rect.height/2);
    const animation = clone.animate([
      { transform:'translate(0,0) rotate(0deg) scale(1)', opacity:1 },
      { transform:`translate(${dx*.72}px,${dy*.72}px) rotate(9deg) scale(.92)`, opacity:1, offset:.72 },
      { transform:`translate(${dx}px,${dy}px) rotate(-2deg) scale(.78)`, opacity:.15 }
    ], { duration:430, easing:'cubic-bezier(.14,.8,.22,1)' });
    animation.onfinish = () => clone.remove();
  }

  function discardSignature() {
    const box = discard();
    if (!box) return '';
    const card = box.querySelector('[data-card-id],[data-id],.uno-card,.flex-card,button') || box.firstElementChild;
    if (!card) return '';
    const cls = [...card.classList].sort().join('.');
    const value = card.dataset?.value || card.querySelector?.('.symbol')?.textContent || card.querySelector?.('.face')?.textContent || card.textContent || '';
    return `${card.dataset?.cardId || card.dataset?.id || ''}|${cls}|${String(value).trim()}`;
  }

  function classifyDiscard() {
    const box = discard();
    const card = box?.querySelector('[data-card-id],[data-id],.uno-card,.flex-card,button') || box?.firstElementChild;
    const text = `${card?.dataset?.value || ''} ${card?.textContent || ''}`.toUpperCase();
    if (text.includes('DEVIL') || text.includes('😈')) return 'devil';
    if (text.includes('+4') || text.includes('DRAW4')) return 'draw4';
    if (text.includes('+2') || text.includes('DRAW2')) return 'draw2';
    if (text.includes('REVERSE') || text.includes('↻') || text.includes('↺')) return 'reverse';
    if (text.includes('SKIP') || text.includes('⊘')) return 'skip';
    if (text.includes('WILD') || text === 'W') return 'wild';
    return 'play';
  }

  const effectLabel = { reverse:'REVERSE', skip:'SKIP', draw2:'+2', draw4:'+4', wild:'WILD', devil:'DEVIL', play:'PLAY' };
  function impact(kind) {
    if (reduced) return;
    const arena = table();
    arena?.classList.remove('dbt-camera-hit');
    if (arena) { void arena.offsetWidth; arena.classList.add('dbt-camera-hit'); setTimeout(()=>arena.classList.remove('dbt-camera-hit'),420); }
    root.dataset.dbtEffect = kind;
    clearTimeout(impactTimer);
    impactTimer = setTimeout(() => { if (root.dataset.dbtEffect === kind) delete root.dataset.dbtEffect; }, 820);
    if (kind === 'draw4' || kind === 'devil') ui.haptic?.([18,26,32]);
    else if (kind === 'draw2' || kind === 'skip' || kind === 'reverse') ui.haptic?.(16);
    else ui.haptic?.(8);
    if (kind === 'draw4' || kind === 'devil') ui.sound?.impact?.(); else ui.sound?.tap?.();
    if (lowPower && kind === 'play') return;
    const layer = document.createElement('div');
    layer.className = 'dbt-impact-layer';
    layer.dataset.kind = kind;
    const word = document.createElement('div');
    word.className = 'dbt-impact-word';
    word.textContent = effectLabel[kind] || 'PLAY';
    if (kind === 'play') word.style.fontSize = 'clamp(1.4rem,4vw,3.2rem)';
    layer.appendChild(word);
    const count = lowPower ? 5 : 10;
    for (let i=0;i<count;i++) {
      const p = document.createElement('i');
      p.className='dbt-impact-particle';
      p.style.setProperty('--r', `${i * (360/count)}deg`);
      p.style.color = kind==='draw4'||kind==='devil' ? '#ff5da7' : kind==='skip' ? '#ffe06b' : '#6ce1ff';
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(()=>layer.remove(),760);
    ui.emit?.('cardimpactvisual',{kind});
  }

  function syncDiscard() {
    const sig = discardSignature();
    if (!sig) return;
    if (!lastDiscardSig) { lastDiscardSig = sig; return; }
    if (sig === lastDiscardSig) return;
    lastDiscardSig = sig;
    flyPlayedCard();
    impact(classifyDiscard());
  }

  function parseCount(text) {
    const m = String(text || '').match(/(\d+)/);
    return m ? Number(m[1]) : Infinity;
  }

  function syncIntensity() {
    const counts = [];
    const ownClassic = $('#hand-count');
    if (ownClassic) counts.push(parseCount(ownClassic.textContent));
    const box = hand(); if (box) counts.push(box.children.length);
    document.querySelectorAll('.opponent-label span:last-child,.game-players .player small').forEach(el => counts.push(parseCount(el.textContent)));
    const min = Math.min(...counts.filter(Number.isFinite));
    root.dataset.dbtIntensity = min <= 1 ? 'final' : min <= 3 ? 'tense' : 'calm';
  }

  function syncActivePlayer() {
    document.querySelectorAll('.dbt-current-player').forEach(el=>el.classList.remove('dbt-current-player'));
    const classicMine = $('#turn')?.classList.contains('mine');
    if (classicMine) $('.me-strip')?.classList.add('dbt-current-player');
    document.querySelectorAll('.opponent-zone.current').forEach(el=>el.classList.add('dbt-current-player'));

    const status = ($('#status')?.textContent || '').trim();
    if (status === 'YOUR TURN ⚡') $('.my-strip')?.classList.add('dbt-current-player');
    else if (status.toLowerCase().includes("'s turn")) {
      const name = status.replace(/'s turn.*/i,'').trim();
      document.querySelectorAll('.game-players .player').forEach(el => {
        const playerName = el.querySelector('b')?.textContent?.trim();
        if (playerName === name) el.classList.add('dbt-current-player');
      });
    }
  }

  function syncClock() {
    const clock = $('#clock');
    if (!clock) return;
    const seconds = parseCount(clock.textContent);
    clock.classList.toggle('dbt-clock-hot', Number.isFinite(seconds) && seconds <= 10 && seconds > 4);
    clock.classList.toggle('dbt-clock-critical', Number.isFinite(seconds) && seconds <= 4);
  }

  function syncFlexColorDialog() {
    const dialog = $('#play-dialog');
    const colors = $('#color-buttons');
    if (!dialog || !colors) return;
    dialog.classList.toggle('dbt-color-choice', !colors.hidden);
  }

  function dealIn() {
    const box = hand(), pile = drawPile();
    if (!box || !pile || reduced) return;
    const rect = pile.getBoundingClientRect();
    [...box.children].forEach((card, i) => animateFromPile(card, rect, Math.min(i * 55, 420)));
    document.querySelectorAll('.opponent-hand .mini-card-back,.game-players .player').forEach((card,i) => {
      if (!card.animate || lowPower) return;
      card.animate([
        { opacity:0, transform:'translateY(-22px) scale(.88)' },
        { opacity:1, transform:'translateY(0) scale(1)' }
      ], { duration:360, delay:Math.min(60*i,420), easing:'cubic-bezier(.16,.84,.26,1)', fill:'both' });
    });
    ui.sound?.confirm?.();
    ui.emit?.('dealvisual',{});
  }

  function syncGameVisibility() {
    const now = visible(gameRoot());
    if (now && !lastGameVisible) {
      setTimeout(() => { knownHandIds = handIds(); syncFan(); dealIn(); syncIntensity(); syncActivePlayer(); }, 80);
    }
    lastGameVisible = now;
  }

  function syncTurn() {
    const text = ($('#turn')?.textContent || $('#status')?.textContent || '').trim();
    if (text && text !== lastTurnText) {
      lastTurnText = text;
      syncActivePlayer();
      if (/তোমার চাল|YOUR TURN/i.test(text)) { ui.haptic?.(12); ui.sound?.confirm?.(); }
    }
  }

  function attachObservers() {
    if (observerAttached) return;
    const h = hand(), d = discard();
    if (!h || !d) return setTimeout(attachObservers,100);
    observerAttached = true;
    knownHandIds = handIds();
    lastDiscardSig = discardSignature();
    h.addEventListener('pointerdown', capturePlayableCard, { passive:true });
    new MutationObserver(() => { syncHandMotion(); syncIntensity(); }).observe(h, { childList:true, subtree:false });
    new MutationObserver(() => { syncDiscard(); syncIntensity(); }).observe(d, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','data-value'] });
    const turn = $('#turn'); if (turn) new MutationObserver(() => { syncTurn(); syncActivePlayer(); }).observe(turn,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    const status = $('#status'); if (status) new MutationObserver(() => { syncTurn(); syncActivePlayer(); }).observe(status,{childList:true,subtree:true,characterData:true});
    const players = $('#players') || $('#opponent-hands'); if (players) new MutationObserver(() => { syncActivePlayer(); syncIntensity(); }).observe(players,{childList:true,subtree:true});
    const clock = $('#clock'); if (clock) new MutationObserver(syncClock).observe(clock,{childList:true,subtree:true,characterData:true});
    const colorButtons = $('#color-buttons'); if (colorButtons) new MutationObserver(syncFlexColorDialog).observe(colorButtons,{attributes:true,attributeFilter:['hidden']});
    const g = gameRoot(); if (g) new MutationObserver(syncGameVisibility).observe(g,{attributes:true,attributeFilter:['hidden','class']});
    syncFan(); syncIntensity(); syncActivePlayer(); syncClock(); syncFlexColorDialog(); syncGameVisibility();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachObservers, { once:true });
  else attachObservers();
})();
