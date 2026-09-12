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
})();
