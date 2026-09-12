(() => {
  const realIo = window.io;
  if (typeof realIo !== 'function') return;
  const wrapped = function (...args) {
    const socket = realIo(...args);
    if (args[0] === '/flex') window.FLEX_SOCKET = socket;
    return socket;
  };
  Object.assign(wrapped, realIo);
  window.io = wrapped;
})();
