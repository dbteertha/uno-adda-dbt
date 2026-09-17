(() => {
  if (window.DBT_FLEX_SOCKET_HOOK) return;
  window.DBT_FLEX_SOCKET_HOOK = true;
  const original = window.io;
  if (typeof original !== 'function') return;
  const wrapped = function(...args) {
    const socket = original(...args);
    if (args[0] === '/flex') window.DBT_FLEX_SOCKET = socket;
    return socket;
  };
  Object.assign(wrapped, original);
  window.io = wrapped;
})();