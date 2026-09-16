(() => {
  const original = window.io;
  if (typeof original !== 'function') return;
  const wrapped = function(...args) {
    const socket = original(...args);
    const first = args[0];
    if (!first || typeof first === 'object') window.DBT_CLASSIC_SOCKET = socket;
    return socket;
  };
  Object.assign(wrapped, original);
  window.io = wrapped;

  window.addEventListener('load', () => {
    if (!document.querySelector('script[data-analytics]')) {
      const analytics = document.createElement('script');
      analytics.src = '/analytics.js?v=1';
      analytics.dataset.analytics = '1';
      document.body.appendChild(analytics);
    }

    if (!document.querySelector('script[data-cinematic-intro]')) {
      const cinematic = document.createElement('script');
      cinematic.src = '/cinematic-intro.js?v=1';
      cinematic.dataset.cinematicIntro = '1';
      document.body.appendChild(cinematic);
    }

    if (!document.querySelector('script[data-admin-lock]')) {
      const lock = document.createElement('script');
      lock.src = '/admin-lock.js?v=hidden-editor-5';
      lock.dataset.adminLock = '1';
      document.body.appendChild(lock);
    }

    const loadRuntime = () => {
      if (document.querySelector('script[data-admin-runtime]')) return;
      const admin = document.createElement('script');
      admin.src = '/admin-runtime.js?v=persist-1';
      admin.dataset.adminRuntime = '1';
      admin.onload = () => {
        if (!document.querySelector('script[data-admin-save-fix]')) {
          const fix = document.createElement('script');
          fix.src = '/admin-save-fix.js?v=3';
          fix.dataset.adminSaveFix = '1';
          document.body.appendChild(fix);
        }
        if (!document.querySelector('script[data-admin-undo-redo]')) {
          const history = document.createElement('script');
          history.src = '/admin-undo-redo.js?v=2';
          history.dataset.adminUndoRedo = '1';
          document.body.appendChild(history);
        }
      };
      document.body.appendChild(admin);
    };

    const loadPersistence = () => {
      if (document.querySelector('script[data-admin-persistence]')) return loadRuntime();
      const persist = document.createElement('script');
      persist.src = '/admin-persistence.js?v=1';
      persist.dataset.adminPersistence = '1';
      persist.onload = loadRuntime;
      document.body.appendChild(persist);
    };

    if (!document.querySelector('script[data-admin-key-fix]')) {
      const keys = document.createElement('script');
      keys.src = '/admin-key-fix.js?v=2';
      keys.dataset.adminKeyFix = '1';
      keys.onload = loadPersistence;
      document.body.appendChild(keys);
    } else {
      loadPersistence();
    }

    if (!window.DBT_CLASSIC_SOCKET || document.querySelector('script[data-mr-bean-commentary]')) return;
    const script = document.createElement('script');
    script.src = '/mr-bean-commentary.js';
    script.dataset.mrBeanCommentary = '1';
    document.body.appendChild(script);
  }, { once: true });
})();