(() => {
  const KEY = 'dbt-visitor-id';
  const SESSION = 'dbt-analytics-session';
  const visitorId = localStorage.getItem(KEY) || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  localStorage.setItem(KEY, visitorId);
  const sessionId = sessionStorage.getItem(SESSION) || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  sessionStorage.setItem(SESSION, sessionId);
  const startedAt = Date.now();
  let lastSent = 0;

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

  const send = (event = 'heartbeat', beacon = false) => {
    const data = JSON.stringify(payload(event));
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/session', new Blob([data], { type:'application/json' }));
      return;
    }
    fetch('/api/analytics/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:data, keepalive:true }).catch(() => {});
  };

  send('start');
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
