(() => {
  if (window.DBT_RECONNECT_V1) return;
  window.DBT_RECONNECT_V1 = true;

  const stable = window.DBT_STABILITY;
  const isStaging = location.hostname === 'addawithdbt-staging.onrender.com' || new URLSearchParams(location.search).get('dbtStaging') === '1';
  if (!isStaging && new URLSearchParams(location.search).get('dbtReconnect') !== '1') return;

  const mode = location.pathname.startsWith('/flex') ? 'flex' : 'classic';
  const socket = mode === 'flex' ? window.DBT_FLEX_SOCKET : window.DBT_CLASSIC_SOCKET;
  if (!socket) return;

  const safe = (name, fn) => {
    try { return fn(); }
    catch (error) { stable?.record?.(`reconnect:${name}`, error); return undefined; }
  };

  let state = null;
  let offlineAt = 0;
  let takeoverName = '';
  let takeoverActive = false;
  let hideTimer = 0;

  const panel = document.createElement('aside');
  panel.id = 'dbt-reconnect-assist';
  panel.hidden = true;
  panel.innerHTML = '<div class="dbt-reconnect-row"><span class="dbt-reconnect-dot"></span><b id="dbt-reconnect-title">Connection ready</b></div><small id="dbt-reconnect-copy">Your match state stays server-authoritative.</small>';
  document.body.appendChild(panel);

  const title = panel.querySelector('#dbt-reconnect-title');
  const copy = panel.querySelector('#dbt-reconnect-copy');

  function show(kind, heading, detail, autoHide = 0) {
    clearTimeout(hideTimer);
    panel.dataset.state = kind;
    panel.hidden = false;
    title.textContent = heading;
    copy.textContent = detail;
    if (autoHide) hideTimer = setTimeout(() => { panel.hidden = true; }, autoHide);
  }

  function connectedAgain() {
    if (!offlineAt) return;
    const seconds = Math.max(1, Math.round((Date.now() - offlineAt) / 1000));
    offlineAt = 0;
    show('ok', 'Back online', `Connection recovered in ${seconds}s. Your room session is being restored.`, 2600);
  }

  function renderClassic() {
    if (!state) return;
    const disconnected = (state.players || []).filter(p => !p.connected && !p.isMe);
    if (takeoverActive && takeoverName) {
      show('takeover', `🤖 AI is holding ${takeoverName}'s seat`, 'The match can continue. If they reconnect, control returns to them automatically.');
      return;
    }
    if (state.paused && disconnected.length) {
      const who = disconnected.map(p => p.displayName).join(', ');
      let seconds = '';
      if (state.reconnectDeadline && state.serverNow) seconds = ` · about ${Math.max(0, Math.ceil((state.reconnectDeadline - state.serverNow) / 1000))}s reconnect window`;
      show('waiting', `Waiting for ${who}`, `The table is protected while their connection recovers${seconds}. AI stand-in activates after a short grace period.`);
      return;
    }
    if (socket.connected && !takeoverActive && !offlineAt) panel.hidden = true;
  }

  function renderFlex() {
    if (!state) return;
    const players = state.players || [];
    const current = players.find(p => p.token === state.currentToken);
    const missing = players.filter(p => !p.connected && !p.isBot);
    if (current && !current.connected && !current.isBot) {
      show('waiting', `Waiting on ${current.name || 'a player'}`, 'Their Flex seat is disconnected. Reconnect assistance is active; no card state is changed by this UI.');
      return;
    }
    if (missing.length) {
      show('waiting', `${missing.length} player${missing.length > 1 ? 's are' : ' is'} reconnecting`, 'Connected seats remain visible while the room waits for recovery.');
      return;
    }
    if (socket.connected && !offlineAt) panel.hidden = true;
  }

  socket.on('disconnect', () => safe('disconnect', () => {
    if (!offlineAt) offlineAt = Date.now();
    show('offline', 'Connection lost — reconnecting automatically', 'Keep this tab open. Your saved room token will be used when the socket returns.');
  }));

  socket.on('connect', () => safe('connect', connectedAgain));

  if (mode === 'classic') {
    socket.on('s_sync_state', s => safe('classic-state', () => { state = s; renderClassic(); }));
    socket.on('s_takeover_notice', payload => safe('takeover-notice', () => {
      takeoverName = String(payload?.name || 'player');
      takeoverActive = !!payload?.active;
      if (takeoverActive) show('takeover', `🤖 AI is holding ${takeoverName}'s seat`, 'The hand stays unchanged. Reconnecting returns control to the same player session.');
      else show('ok', `${takeoverName} is back`, 'AI stand-in released the seat and human control is restored.', 2800);
    }));
  } else {
    socket.on('f_state', s => safe('flex-state', () => { state = s; renderFlex(); }));
    socket.on('f_left', () => safe('flex-left', () => { state = null; panel.hidden = true; }));
  }

  window.addEventListener('offline', () => safe('browser-offline', () => {
    if (!offlineAt) offlineAt = Date.now();
    show('offline', 'Device is offline', 'The game will reconnect automatically when your network returns.');
  }));
  window.addEventListener('online', () => safe('browser-online', connectedAgain));

  setInterval(() => safe('render', () => mode === 'classic' ? renderClassic() : renderFlex()), 1000);
})();