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
    if (!document.querySelector('script[data-admin-lock]')) {
      const lock = document.createElement('script');
      lock.src = '/admin-lock.js';
      lock.dataset.adminLock = '1';
      document.body.appendChild(lock);
    }
    if (!document.querySelector('script[data-admin-runtime]')) {
      const admin = document.createElement('script');
      admin.src = '/admin-runtime.js';
      admin.dataset.adminRuntime = '1';
      document.body.appendChild(admin);
    }
    if (!window.DBT_CLASSIC_SOCKET || document.querySelector('script[data-mr-bean-commentary]')) return;
    const script = document.createElement('script');
    script.src = '/mr-bean-commentary.js';
    script.dataset.mrBeanCommentary = '1';
    document.body.appendChild(script);
  }, { once: true });
})();
