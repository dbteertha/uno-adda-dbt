(() => {
  const KEY = 'dbt-visitor-id';
  const SESSION = 'dbt-analytics-session';
  const ARCHIVE = 'dbt-analytics-archive-v1';
  const visitorId = localStorage.getItem(KEY) || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  localStorage.setItem(KEY, visitorId);
  const sessionId = sessionStorage.getItem(SESSION) || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  sessionStorage.setItem(SESSION, sessionId);
  const startedAt = Number(sessionStorage.getItem(`${SESSION}-started`)) || Date.now();
  sessionStorage.setItem(`${SESSION}-started`, String(startedAt));
  let lastSent = 0;

  const readArchive = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(ARCHIVE) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };

  const writeArchive = (items) => {
    try { localStorage.setItem(ARCHIVE, JSON.stringify(items.slice(-250))); } catch {}
  };

  const saveArchive = (entry) => {
    const items = readArchive();
    const i = items.findIndex((x) => x && x.sessionId === entry.sessionId);
    if (i >= 0) items[i] = { ...items[i], ...entry };
    else items.push(entry);
    writeArchive(items);
  };

  const payload = (event = 'heartbeat') => ({
    sessionId,
    visitorId,
    name: (localStorage.getItem('dbt-player-name') || '').slice(0, 40),
    startedAt,
    durationMs: Date.now() - startedAt,
    page: location.pathname + location.search,
    referrer: document.referrer || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    screen: `${screen.width}x${screen.height}`,
    event,
  });

  const post = (entry, beacon = false) => {
    const data = JSON.stringify(entry);
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/session', new Blob([data], { type:'application/json' }));
      return Promise.resolve();
    }
    return fetch('/api/analytics/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:data, keepalive:true }).catch(() => {});
  };

  const send = (event = 'heartbeat', beacon = false) => {
    const entry = payload(event);
    saveArchive(entry);
    return post(entry, beacon);
  };

  // Rehydrate this browser's complete visit history if Render restarted or redeployed.
  const restoreHistory = async () => {
    const archived = readArchive();
    for (const entry of archived.slice(-250)) {
      if (!entry?.sessionId || !entry?.visitorId) continue;
      await post({ ...entry, event: entry.event === 'end' ? 'end' : 'heartbeat' });
    }
  };

  restoreHistory().finally(() => send('start'));
  setInterval(() => {
    if (document.visibilityState === 'visible') send('heartbeat');
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send('heartbeat', true);
    else if (Date.now() - lastSent > 5000) { lastSent = Date.now(); send('heartbeat'); }
  });
  addEventListener('pagehide', () => send('end', true));
  addEventListener('beforeunload', () => send('end', true));

  addEventListener('storage', (e) => { if (e.key === 'dbt-player-name') send('heartbeat'); });
})();
