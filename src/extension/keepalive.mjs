export const KEEPALIVE_INTERVAL_MS = 15_000;

/**
 * Keep a browser WebSocket active with a small application-level message.
 * The returned controller is idempotent: one interval per socket lifecycle,
 * and stop() always releases the timer on close or replacement.
 */
export function createWebSocketKeepalive({
  getSocket,
  intervalMs = KEEPALIVE_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  if (typeof getSocket !== 'function') throw new TypeError('getSocket is required');
  let timer = null;

  function tick() {
    const socket = getSocket();
    if (!socket || socket.readyState !== 1 || typeof socket.send !== 'function') return;
    try {
      socket.send(JSON.stringify({ kind: 'keepalive' }));
    } catch {
      // The socket close/error lifecycle performs cleanup and reconnect.
    }
  }

  return {
    start() {
      if (timer !== null) return false;
      timer = setIntervalFn(tick, intervalMs);
      return true;
    },
    stop() {
      if (timer === null) return false;
      clearIntervalFn(timer);
      timer = null;
      return true;
    },
    tick,
    get active() {
      return timer !== null;
    },
  };
}

