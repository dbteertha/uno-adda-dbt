(() => {
  if (window.DBT_PREMIUM_CORE) return;
  window.DBT_PREMIUM_CORE = true;

  const root = document.documentElement;
  root.classList.add('dbt-premium-v1');

  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const lowPower = !!navigator.connection?.saveData || ((navigator.hardwareConcurrency || 8) <= 4) || ((navigator.deviceMemory || 8) <= 4);
  if (lowPower) root.classList.add('dbt-lite');

  const motion = Object.freeze({ fast: 140, normal: 260, impact: 420, cinematic: 720 });
  const bus = new EventTarget();
  const emit = (type, detail = {}) => bus.dispatchEvent(new CustomEvent(type, { detail }));

  const haptic = (pattern = 12) => {
    try {
      const reduce = reducedMotion || root.classList.contains('dbt-reduce-motion');
      if (!reduce && navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  };

  let audioContext = null;
  const ensureAudio = () => {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
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
  let screens = [];
  let activeScreen = '';
  const syncScreen = () => {
    let next = '';
    let nextEl = null;
    for (const [name, el] of screens) {
      if (visible(el)) { next = name; nextEl = el; }
    }
    if (!next || next === activeScreen) return;
    activeScreen = next;
    root.dataset.dbtScreen = next;
    if (nextEl && !reducedMotion && !root.classList.contains('dbt-reduce-motion')) {
      nextEl.classList.remove('dbt-screen-enter');
      void nextEl.offsetWidth;
      nextEl.classList.add('dbt-screen-enter');
      setTimeout(() => nextEl.classList.remove('dbt-screen-enter'), motion.impact);
    }
    emit('screenchange', { screen: next });
  };

  const pulseTurn = (el) => {
    if (!el || reducedMotion || root.classList.contains('dbt-reduce-motion')) return;
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

  const bindButton = (button) => {
    if (!(button instanceof HTMLButtonElement) || button.dataset.dbtPremiumBound) return;
    button.dataset.dbtPremiumBound = '1';
    button.addEventListener('pointerdown', () => {
      if (button.disabled) return;
      button.classList.remove('dbt-press');
      void button.offsetWidth;
      button.classList.add('dbt-press');
      setTimeout(() => button.classList.remove('dbt-press'), 220);
    }, { passive: true });
  };

  const decorateTree = (node) => {
    if (!(node instanceof Element)) return;
    if (node.matches('button')) bindButton(node);
    node.querySelectorAll?.('button:not([data-dbt-premium-bound])').forEach(bindButton);
  };

  const upgradeThemeColor = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#07111f');
  };

  const syncPerformanceClass = () => {
    const hand = document.getElementById('hand');
    if (!hand) return;
    root.classList.toggle('dbt-heavy-hand', hand.children.length >= 18);
  };

  const buttonObserver = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) decorateTree(node);
  });

  const screenObserver = new MutationObserver(() => syncScreen());
  const handObserver = new MutationObserver(() => syncPerformanceClass());

  const syncAudioLifecycle = () => {
    if (!audioContext) return;
    if (document.visibilityState !== 'visible' && audioContext.state === 'running') audioContext.suspend().catch(() => {});
  };

  const boot = () => {
    upgradeThemeColor();
    decorateTree(document.body);
    observeTurn();
    screens = screenSelectors.map(([name, selector]) => [name, document.querySelector(selector)]).filter(([,el]) => el);
    syncScreen();
    syncPerformanceClass();
    buttonObserver.observe(document.body, { childList: true, subtree: true });
    for (const [,el] of screens) screenObserver.observe(el, { attributes: true, attributeFilter: ['hidden', 'class'] });
    const hand = document.getElementById('hand');
    if (hand) handObserver.observe(hand, { childList: true });
    document.addEventListener('visibilitychange', syncAudioLifecycle);
    emit('ready', { lowPower, reducedMotion });
  };

  window.DBT_UI = Object.freeze({ bus, emit, motion, toast, haptic, sound, reducedMotion, lowPower });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
