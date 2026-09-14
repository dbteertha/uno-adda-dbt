(() => {
  const socket = window.DBT_CLASSIC_SOCKET;
  if (!socket) return;

  const commentator = document.getElementById('commentator-name');
  const text = document.getElementById('commentary-text');
  const box = document.getElementById('commentary');
  if (commentator) commentator.textContent = '🎙️ MR BEAN';

  const jokes = [
    (n) => `${n} is thinking so hard the cards are getting nervous.`,
    (n) => `${n} has the turn. The deck has requested legal representation.`,
    (n) => `${n} is on duty. Absolutely no pressure. Only everybody watching.`,
    (n) => `${n} is cooking. Nobody knows what, including the cards.`,
    (n) => `${n} has the turn. This could be genius or premium nonsense.`,
    (n) => `${n} is up. The table has become suspiciously quiet.`,
    (n) => `${n} enters the danger zone. The draw pile looks worried.`,
    (n) => `${n} has control. Somewhere, a +4 is smiling.`,
    (n) => `${n} is choosing destiny one cardboard rectangle at a time.`,
    (n) => `${n} has the turn. Mr Bean recommends confidence with no evidence.`,
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
    const turnKey = `${state.round || 0}:${state.revision || 0}:${current.displayName}:${current.seat ?? ''}`;
    const identityKey = `${state.round || 0}:${current.displayName}:${current.seat ?? ''}`;
    if (lastTurnKey === identityKey) return;
    lastTurnKey = identityKey;

    if (commentator) commentator.textContent = '🎙️ MR BEAN';
    if (text) text.textContent = jokes[Math.floor(Math.random() * jokes.length)](current.displayName);
    if (box) {
      box.classList.remove('mr-bean-pop');
      void box.offsetWidth;
      box.classList.add('mr-bean-pop');
    }
    speakNameOnly(current.displayName);
  });
})();