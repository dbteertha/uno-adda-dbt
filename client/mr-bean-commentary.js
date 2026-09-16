(() => {
  const socket = window.DBT_CLASSIC_SOCKET;
  if (!socket) return;

  const commentator = document.getElementById('commentator-name');
  const text = document.getElementById('commentary-text');
  const box = document.getElementById('commentary');
  if (commentator) commentator.textContent = '🐾 MISTI + SUJI';

  const misti = [
    (n) => `Misti: ${n}, think first. Then make it hurt.`,
    (n) => `Misti: ${n} has the turn. Watch the color and the count.`,
    (n) => `Misti: ${n} is calculating. Suji is pretending to help.`,
    (n) => `Misti: ${n}, one clean move can change the table.`,
    (n) => `Misti: ${n} is up. No panic, just timing.`
  ];
  const suji = [
    (n) => `Suji: ${n} is thinking so hard the deck is nervous 😹`,
    (n) => `Suji: ${n}'s turn! Somebody hide the +4.`,
    (n) => `Suji: ${n} is cooking. I do not trust the recipe.`,
    (n) => `Suji: ${n}, choose chaos. I support chaos.`,
    (n) => `Suji: ${n} has control. This seems unsafe 😼`
  ];

  let lastTurnKey = '';
  const speakNameOnly = (name) => {
    try {
      if (!('speechSynthesis' in window) || !name) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(name);
      utter.rate = 0.96;
      utter.pitch = 1.02;
      utter.volume = 0.9;
      window.speechSynthesis.speak(utter);
    } catch {}
  };

  socket.on('s_sync_state', (state) => {
    if (!state || state.status !== 'PLAYING') return;
    const current = (state.players || []).find((p) => p.isCurrent);
    if (!current?.displayName) return;
    const identityKey = `${state.round || 0}:${current.displayName}:${current.seat ?? ''}`;
    if (lastTurnKey === identityKey) return;
    lastTurnKey = identityKey;

    const useMisti = Math.random() > .48;
    const set = useMisti ? misti : suji;
    if (commentator) commentator.textContent = useMisti ? '🎙️ MISTI' : '🎙️ SUJI';
    if (text) text.textContent = set[Math.floor(Math.random() * set.length)](current.displayName);
    if (box) {
      box.classList.remove('mr-bean-pop');
      void box.offsetWidth;
      box.classList.add('mr-bean-pop');
    }
    speakNameOnly(current.displayName);
  });
})();