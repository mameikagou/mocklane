/* Mocklane dashboard · daemon 传输层
 * 只负责 WebSocket 连接、RPC 请求/响应配对、断线重连。
 * 不含任何业务状态；状态归 lib/store.js，组件不直接触碰本模块。 */

const RPC_TIMEOUT_MS = 5500;
const MAX_RETRY_DELAY_MS = 8000;

export function createMocklaneClient({ url, onOpen, onClose, onMessage, onError }) {
  let socket = null;
  let disposed = false;
  let retryAttempt = 0;
  let reconnectTimer;
  let requestSeq = 0;
  const pending = new Map();

  const rejectPending = (message) => {
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return;
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** retryAttempt);
    retryAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  };

  const connect = () => {
    if (disposed) return;
    try {
      socket = new WebSocket(url);
    } catch {
      onError?.('cannot reach daemon; retrying connection');
      scheduleReconnect();
      return;
    }
    socket.onopen = () => {
      if (disposed) return;
      retryAttempt = 0;
      socket.send(JSON.stringify({ kind: 'hello', role: 'dashboard' }));
      onOpen?.();
    };
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.kind === 'rpc-result') {
        const entry = pending.get(message.requestId);
        if (!entry) return;
        pending.delete(message.requestId);
        entry.resolve(message.result);
        return;
      }
      onMessage?.(message);
    };
    socket.onerror = () => {
      if (!disposed) onError?.('cannot reach daemon; retrying connection');
    };
    socket.onclose = () => {
      if (disposed) return;
      rejectPending('daemon connection closed');
      onClose?.();
      scheduleReconnect();
    };
  };

  connect();

  return {
    rpc(command) {
      return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          reject(new Error('daemon is not connected'));
          return;
        }
        const requestId = `dashboard_${Date.now().toString(36)}_${requestSeq++}`;
        pending.set(requestId, { resolve, reject });
        socket.send(JSON.stringify({ kind: 'rpc', requestId, command }));
        setTimeout(() => {
          const entry = pending.get(requestId);
          if (!entry) return;
          pending.delete(requestId);
          reject(new Error('extension response timed out'));
        }, RPC_TIMEOUT_MS);
      });
    },
    dispose() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
      rejectPending('dashboard closed');
    },
  };
}
