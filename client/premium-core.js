(() => {
  if (window.DBT_PREMIUM_CORE) return;
  window.DBT_PREMIUM_CORE = true;

  const root = document.documentElement;
  root.classList.add('dbt-premium-v1');

  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const lowPower = ((navigator.hardwareConcurrency || 8) <= 4) || ((navigator.deviceMemory || 8) <= 4);
  if (lowPower) root.classList.add('dbt-lite');

  const motion = Object.freeze({ fast: 140, normal: 260, impact: 420, cinematic: 720 });
  const bus = new EventTarget();
  const emit = (type, detail = {}) => bus.dispatchEvent(new CustomEvent(type, { detail }));

  const haptic = (pattern = 12) => {
    try { if (!reducedMotion && navigator.vibrate) navigator.vibrate(pattern); } catch {}
  };

  let audioContext = null;
  const ensureAudio = () => {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      return audioContext;
    } catch { return null; }
  };
  const tone = (frequency = 440, duration = .05, gain = .025) => {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(frequency, now);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + .008);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(now); osc.stop(now + duration + .02);
    } catch {}
  };

  const sound = Object.freeze({
    tap: () => tone(520, .045, .018),
    confirm: () => { tone(620, .06, .02); setTimeout(() => tone(820, .07, .016), 55); },
    impact: () => tone(180, .09, .028),
  });

  const visible = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  const screenSelectors = [
    ['home', '#home'], ['menu', '#menu'], ['lobby', '#lobby'], ['playing', '#board'],
    ['tutorial', '#tutorial'], ['mode', '#mode'], ['setup', '#setup'], ['flex-lobby', '#lobby.screen'], ['flex-playing', '#game']
  ];
  let activeScreen = '';
  const syncScreen = () => {
    let next = '';
    for (const [name, selector] of screenSelectors) {
      const el = document.querySelector(selector);
      if (visible(el)) next = name;
    }
    if (!next || next === activeScreen) return;
    activeScreen = next;
    root.dataset.dbtScreen = next;
    const el = screenSelectors.map(([,s]) => document.querySelector(s)).find((x) => visible(x));
    if (el && !reducedMotion) {
      el.classList.remove('dbt-screen-enter');
      void el.offsetWidth;
      el.classList.add('dbt-screen-enter');
      setTimeout(() => el.classList.remove('dbt-screen-enter'), motion.impact);
    }
    emit('screenchange', { screen: next });
  };

  const pulseTurn = (el) => {
    if (!el || reducedMotion) return;
    el.classList.remove('dbt-turn-pulse');
    void el.offsetWidth;
    el.classList.add('dbt-turn-pulse');
    setTimeout(() => el.classList.remove('dbt-turn-pulse'), 850);
  };

  const observeTurn = () => {
    for (const el of [document.getElementById('turn'), document.getElementById('status')].filter(Boolean)) {
      let last = el.textContent || '';
      new MutationObserver(() => {
        const now = el.textContent || '';
        if (now && now !== last) {
          last = now;
          pulseTurn(el);
          emit('turnlabelchange', { text: now });
        }
      }).observe(el, { subtree: true, childList: true, characterData: true });
    }
  };

  const toast = (message, kind = 'info') => {
    const el = document.getElementById('toast') || document.querySelector('.toast');
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2500);
  };

  const decorateButtons = () => {
    document.querySelectorAll('button:not([data-dbt-premium-bound])').forEach((button) => {
      button.dataset.dbtPremiumBound = '1';
      button.addEventListener('pointerdown', () => {
        if (button.disabled) return;
        button.classList.remove('dbt-press');
        void button.offsetWidth;
        button.classList.add('dbt-press');
        setTimeout(() => button.classList.remove('dbt-press'), 220);
      }, { passive: true });
    });
  };

  const upgradeThemeColor = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#07111f');
  };

  const syncPerformanceClass = () => {
    const hand = document.getElementById('hand');
    if (!hand) return;
    const count = hand.children.length;
    root.classList.toggle('dbt-heavy-hand', count >= 18);
  };

  const observer = new MutationObserver(() => {
    decorateButtons();
    syncScreen();
    syncPerformanceClass();
  });

  const boot = () => {
    upgradeThemeColor();
    decorateButtons();
    observeTurn();
    syncScreen();
    syncPerformanceClass();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    emit('ready', { lowPower, reducedMotion });
  };

  window.DBT_UI = Object.freeze({ bus, emit, motion, toast, haptic, sound, reducedMotion, lowPower });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
