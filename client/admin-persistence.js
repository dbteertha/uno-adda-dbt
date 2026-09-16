(() => {
  const KEY = 'dbt-live-editor-config-v1';
  const realFetch = window.fetch.bind(window);

  const readLocal = () => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  };

  const writeLocal = (cfg) => {
    try {
      if (cfg && typeof cfg === 'object') localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch {}
  };

  const isConfigGet = (input, init) => {
    const method = String(init?.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input?.url || '';
    return method === 'GET' && (url === '/api/config' || url.endsWith('/api/config'));
  };

  const isConfigPut = (input, init) => {
    const method = String(init?.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input?.url || '';
    return method === 'PUT' && (url === '/api/admin/config' || url.endsWith('/api/admin/config'));
  };

  window.fetch = async (input, init = {}) => {
    if (isConfigPut(input, init)) {
      let body = init.body;
      try {
        const cfg = JSON.parse(String(body || '{}'));
        cfg.savedAt = Date.now();
        body = JSON.stringify(cfg);
        writeLocal(cfg);
      } catch {}
      const response = await realFetch(input, { ...init, body });
      if (response.ok) {
        try {
          const data = await response.clone().json();
          if (data?.config) writeLocal(data.config);
        } catch {}
      }
      return response;
    }

    if (isConfigGet(input, init)) {
      const response = await realFetch(input, init);
      if (!response.ok) return response;
      try {
        const serverCfg = await response.clone().json();
        const localCfg = readLocal();
        const serverTs = Number(serverCfg?.savedAt || 0);
        const localTs = Number(localCfg?.savedAt || 0);
        const chosen = localCfg && localTs > serverTs ? localCfg : serverCfg;
        writeLocal(chosen);

        if (localCfg && localTs > serverTs) {
          realFetch('/api/admin/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localCfg),
            cache: 'no-store',
          }).catch(() => {});
        }

        return new Response(JSON.stringify(chosen), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      } catch {
        return response;
      }
    }

    return realFetch(input, init);
  };

  window.addEventListener('dbt-admin-config', (e) => {
    const cfg = e.detail;
    if (cfg && typeof cfg === 'object') {
      const local = readLocal();
      if (Number(cfg.savedAt || 0) >= Number(local?.savedAt || 0)) writeLocal(cfg);
    }
  });
})();
