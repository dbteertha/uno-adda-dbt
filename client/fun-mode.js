(() => {
  if (window.__dbtFunModeInstalled) return;
  window.__dbtFunModeInstalled = true;

  const socket = window.DBT_CLASSIC_SOCKET;
  const board = document.getElementById('board');
  if (!board) return;

  const style = document.createElement('style');
  style.textContent = `
    #dbt-fun-announcer{position:fixed;left:50%;top:78px;z-index:2147482000;transform:translate(-50%,-16px) scale(.96);max-width:min(92vw,680px);padding:11px 18px;border-radius:999px;background:rgba(9,11,18,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px rgba(0,0,0,.38);color:#fff;font:800 14px/1.2 Inter,system-ui,sans-serif;letter-spacing:.01em;text-align:center;opacity:0;pointer-events:none;transition:.22s ease}
    #dbt-fun-announcer.show{opacity:1;transform:translate(-50%,0) scale(1)}
    #dbt-chaos-badge{position:fixed;right:12px;bottom:12px;z-index:80;padding:8px 11px;border-radius:12px;background:rgba(8,10,16,.82);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(8px);color:#fff;font:800 11px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;pointer-events:none;transition:.2s ease}
    #dbt-chaos-badge.hot{transform:scale(1.08) rotate(-1deg);box-shadow:0 0 22px rgba(255,87,34,.34)}
    .dbt-pop-emoji{position:fixed;left:50%;top:50%;z-index:2147481999;font-size:clamp(22px,5vw,42px);pointer-events:none;animation:dbtPopEmoji .9s cubic-bezier(.15,.7,.2,1) forwards}
    @keyframes dbtPopEmoji{0%{opacity:0;transform:translate(-50%,-50%) scale(.4) rotate(0)}18%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.35) rotate(var(--r))}}
    .dbt-button-boing{animation:dbtBoing .24s ease}
    @keyframes dbtBoing{50%{transform:scale(.93)}100%{transform:scale(1)}}
    #results.dbt-win-party::backdrop{background:rgba(0,0,0,.72)}
    #results.dbt-win-party{box-shadow:0 0 0 2px rgba(255,255,255,.08),0 25px 90px rgba(0,0,0,.7)}
    @media(max-width:600px){#dbt-fun-announcer{top:66px;font-size:12px;padding:10px 14px}#dbt-chaos-badge{font-size:10px}}
  `;
  document.head.appendChild(style);

  const announcer = document.createElement('div');
  announcer.id = 'dbt-fun-announcer';
  announcer.setAttribute('aria-live','polite');
  document.body.appendChild(announcer);

  const chaos = document.createElement('div');
  chaos.id = 'dbt-chaos-badge';
  chaos.textContent = 'TABLE CHAOS · CALM 😌';
  document.body.appendChild(chaos);

  let announceTimer = 0;
  let chaosScore = 0;
  let chaosTimer = 0;
  let lastTurn = '';
  let lastDiscard = '';
  let lastHand = null;
  let lastResultOpen = false;

  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];

  function say(text, ms = 2100) {
    if (!text) return;
    announcer.textContent = text;
    announcer.classList.add('show');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announcer.classList.remove('show'), ms);
  }

  function burst(emojis, amount = 9) {
    for (let i=0;i<amount;i++) {
      const el = document.createElement('span');
      el.className = 'dbt-pop-emoji';
      el.textContent = pick(emojis);
      el.style.setProperty('--x', `${Math.round((Math.random()-.5)*520)}px`);
      el.style.setProperty('--y', `${Math.round((Math.random()-.5)*360)}px`);
      el.style.setProperty('--r', `${Math.round((Math.random()-.5)*120)}deg`);
      el.style.left = `${36 + Math.random()*28}%`;
      el.style.top = `${40 + Math.random()*22}%`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 1000);
    }
  }

  function bumpChaos(points=1) {
    chaosScore = Math.min(12, chaosScore + points);
    clearTimeout(chaosTimer);
    chaos.classList.add('hot');
    const label = chaosScore >= 9 ? 'NUCLEAR 🤯' : chaosScore >= 6 ? 'UNHINGED 😂' : chaosScore >= 3 ? 'HOT 🔥' : 'WARM 😏';
    chaos.textContent = `TABLE CHAOS · ${label}`;
    setTimeout(()=>chaos.classList.remove('hot'), 260);
    chaosTimer = setTimeout(() => {
      chaosScore = Math.max(0, chaosScore - 2);
      const next = chaosScore >= 6 ? 'UNHINGED 😂' : chaosScore >= 3 ? 'HOT 🔥' : chaosScore ? 'WARM 😏' : 'CALM 😌';
      chaos.textContent = `TABLE CHAOS · ${next}`;
    }, 5000);
  }

  function handleTurn() {
    const el = document.getElementById('turn');
    const text = el?.textContent?.trim() || '';
    if (!text || text === lastTurn) return;
    lastTurn = text;
    if (board.hidden) return;
    const quips = [
      `🎯 ${text} — এখন ভুল করলেই ইতিহাস!`,
      `👀 ${text} — সবাই তাকিয়ে আছে বস!`,
      `🔥 ${text} — টেবিল গরম করো!`,
      `😂 ${text} — কার্ড আছে তো, সাহস আছে?`,
      `🎙️ ${text} — pressure is free today.`
    ];
    say(pick(quips), 1800);
  }

  function handleDiscard() {
    const el = document.getElementById('discard');
    const text = (el?.textContent || '').trim();
    const html = el?.innerHTML || '';
    const sig = text + '|' + html;
    if (!sig || sig === lastDiscard) return;
    if (lastDiscard) {
      const t = text.toUpperCase();
      if (t.includes('+4') || t.includes('DRAW 4') || t.includes('DRAW FOUR')) {
        say(pick(['💀 +4! বন্ধুত্ব সাময়িকভাবে বাতিল।','😈 +4 landed. আদালতে দেখা হবে.','🧨 +4! টেবিলে শান্তি শেষ.']), 2400);
        burst(['💀','😂','🔥','+4'], 13); bumpChaos(4);
      } else if (t.includes('+2') || t.includes('DRAW 2')) {
        say(pick(['😂 +2 খাও, পানি খেয়ে আসো.','📈 কার্ডের শেয়ারবাজার উঠছে!','😏 +2 — ছোট আঘাত, বড় অপমান.']), 2100);
        burst(['+2','😂','🃏'], 9); bumpChaos(2);
      } else if (t.includes('REVERSE') || t.includes('↻') || t.includes('↺')) {
        say(pick(['🔄 Reverse! প্লট টুইস্ট ভাই.','↩️ Uno said: ঘুরে দাঁড়াও.','😂 Reverse — karma delivery.']), 1900);
        burst(['🔄','↩️','😂'], 8); bumpChaos(2);
      } else if (t.includes('SKIP') || t.includes('⊘') || t.includes('⏭')) {
        say(pick(['⏭️ Skip! তোমার পালা ছিল, এখন স্মৃতি.','🚫 বসে থাকো ভাই 😂','😴 Skip — free spectator mode unlocked.']), 2000);
        burst(['⏭️','🚫','😂'], 8); bumpChaos(2);
      } else if (t.includes('WILD') || t.includes('🌈')) {
        say(pick(['🌈 Wild! রঙ বদল, মুড বদল.','🎨 Color politics begins.','🌈 Wild card entered the chat.']), 1900);
        burst(['🌈','🎨','✨'], 9); bumpChaos(2);
      } else {
        bumpChaos(1);
      }
    }
    lastDiscard = sig;
  }

  function handleHand() {
    const el = document.getElementById('hand-count');
    const n = Number((el?.textContent || '').match(/\d+/)?.[0]);
    if (!Number.isFinite(n)) return;
    if (lastHand !== null && !board.hidden) {
      if (n > lastHand) {
        say(pick(['🃏 কার্ডের দোকান খুলতেছ নাকি? 😂','📦 নতুন stock এসে গেছে!','😅 Hand size said: আরও চাই.']), 1800);
        bumpChaos(1);
      } else if (n === 1 && lastHand > 1) {
        say('🚨 ONE CARD LEFT — UNO smell detected!', 2300);
        burst(['🚨','🔥','😈','UNO'], 12); bumpChaos(3);
      }
    }
    lastHand = n;
  }

  function handleResult() {
    const modal = document.getElementById('results');
    if (!modal) return;
    const open = modal.open || !modal.hidden && modal.hasAttribute('open');
    if (open && !lastResultOpen) {
      modal.classList.add('dbt-win-party');
      const winner = document.getElementById('winner')?.textContent?.trim();
      say(winner ? `🏆 ${winner} — আজকে টেবিল তোমার!` : '🏆 GAME OVER — ego damage detected 😂', 3200);
      burst(['🏆','🎉','🔥','😂','✨'], 24);
      bumpChaos(6);
    }
    lastResultOpen = open;
  }

  const watch = () => { handleTurn(); handleDiscard(); handleHand(); handleResult(); };
  new MutationObserver(watch).observe(board, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','open']});
  const results = document.getElementById('results');
  if (results) new MutationObserver(handleResult).observe(results,{attributes:true,attributeFilter:['open','hidden']});

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button');
    if (!btn || board.hidden) return;
    btn.classList.remove('dbt-button-boing');
    void btn.offsetWidth;
    btn.classList.add('dbt-button-boing');
    setTimeout(()=>btn.classList.remove('dbt-button-boing'), 260);
  }, true);

  socket?.on?.('s_troll_reaction', () => { burst(['😂','💀','🔥','😈'], 10); bumpChaos(2); });
  socket?.on?.('s_power_notice', () => { burst(['⚡','✨','💥'], 9); bumpChaos(3); });
  socket?.on?.('s_devil_reveal', () => { say('😈 DEVIL CARD! Privacy left the chat.', 2300); burst(['😈','👀','💀'], 14); bumpChaos(4); });

  setInterval(() => {
    if (board.hidden || document.hidden) return;
    const lines = [
      '🎙️ DBT commentator: friendship status — complicated.',
      '👀 কেউ bluff করছে. নাম বলব না.',
      '😂 এই টেবিলে strategy কম, confidence বেশি.',
      '🃏 Remember: কার্ড innocent, player suspicious.',
      '🔥 শান্ত UNO বলে কিছু নেই.'
    ];
    if (Math.random() < .45) say(pick(lines), 2000);
  }, 24000);

  watch();
})();