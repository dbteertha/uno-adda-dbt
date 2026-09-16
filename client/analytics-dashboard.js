(() => {
  const params = new URLSearchParams(location.search);
  const key = params.get('key') || '';
  const rows = document.getElementById('rows');
  const summary = document.getElementById('summary');
  const updated = document.getElementById('updated');
  const refresh = document.getElementById('refresh');

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const duration = (ms) => {
    const sec = Math.max(0, Math.round((Number(ms)||0)/1000));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
  };
  const when = (ts) => ts ? new Date(ts).toLocaleString() : '—';

  async function load() {
    if (!key) {
      summary.innerHTML = '<div class="error">Missing analytics key.</div>';
      rows.innerHTML = '';
      return;
    }
    refresh.disabled = true;
    try {
      const r = await fetch(`/api/analytics/report?key=${encodeURIComponent(key)}`, {cache:'no-store'});
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Unable to load analytics');
      const s = d.summary || {};
      summary.innerHTML = `
        <article><b>${s.activeNow || 0}</b><span>ACTIVE NOW</span></article>
        <article><b>${s.uniqueVisitors || 0}</b><span>UNIQUE VISITORS</span></article>
        <article><b>${s.sessions || 0}</b><span>SESSIONS</span></article>
        <article><b>${duration(s.averageDurationMs || 0)}</b><span>AVG. TIME</span></article>`;
      rows.innerHTML = (d.sessions || []).map((x) => {
        const person = x.name ? `<b>${esc(x.name)}</b><small>${esc(x.visitorId.slice(0,8))}</small>` : `<b>Anonymous</b><small>${esc(x.visitorId.slice(0,8))}</small>`;
        const region = [x.country, x.timezone].filter(Boolean).map(esc).join(' · ') || 'Unknown';
        return `<tr>
          <td><span class="status ${x.active?'live':''}">${x.active?'LIVE':'OFFLINE'}</span></td>
          <td class="person">${person}</td>
          <td><b>${esc(when(x.startedAt))}</b><small>Last: ${esc(when(x.lastSeenAt))}</small></td>
          <td>${esc(duration(x.durationMs))}</td>
          <td>${region}</td>
          <td><b>${esc(x.deviceName || x.deviceType)}</b><small>${esc(x.screen || '')}</small></td>
          <td><b>${esc(x.browser)}</b><small>${esc(x.os)}</small></td>
          <td>${esc(x.page || '/')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="empty">No visits recorded yet.</td></tr>';
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      summary.innerHTML = `<div class="error">${esc(e.message || e)}</div>`;
      rows.innerHTML = '';
    } finally { refresh.disabled = false; }
  }
  refresh.addEventListener('click', load);
  load();
  setInterval(load, 15000);
})();
