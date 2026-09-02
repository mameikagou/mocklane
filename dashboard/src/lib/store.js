/* Mocklane dashboard · 应用状态与动作
 * 唯一状态源。组件通过 useMocklane(selector) 订阅切片，
 * 通过本模块导出的动作（refresh / changeGlobal / switchScenario / toggleRule）变更状态。
 * App 挂载时调用一次 initMocklane() 建立 daemon 连接并把事件汇入 store。 */
import { useSyncExternalStore } from 'react';
import { createMocklaneClient } from './client.js';

const MAX_HITS = 80;

const initialState = {
  daemonConnected: false,
  extensionConnected: false,
  globalEnabled: false,
  rules: [],
  logs: [],
  lastError: '',
  lastUpdated: null,
};

let state = initialState;
const listeners = new Set();
let client = null;

function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function useMocklane(selector) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(state),
  );
}

function socketUrl() {
  const host = window.location.hostname || '127.0.0.1';
  const port = window.location.port || '17321';
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host}:${port}/ws`;
}

function rpc(command) {
  if (!client) return Promise.reject(new Error('daemon is not connected'));
  return client.rpc(command);
}

/** 建立 daemon 连接并把 socket 事件汇入 store。幂等；返回清理函数（供 useEffect）。 */
export function initMocklane() {
  if (client) return () => {};
  client = createMocklaneClient({
    url: socketUrl(),
    onOpen: () => setState({ daemonConnected: true, lastError: '' }),
    onClose: () => setState({ daemonConnected: false, extensionConnected: false }),
    onError: (message) => setState({ lastError: message }),
    onMessage: (message) => {
      if (message.kind === 'hello') {
        setState({ extensionConnected: message.extensionConnected === true });
        refresh();
      } else if (message.kind === 'event' && message.event === 'connections') {
        setState({ extensionConnected: message.extensionConnected === true });
        if (message.extensionConnected === true) refresh();
      } else if (message.kind === 'event' && message.event === 'hit' && message.hit) {
        setState({ logs: [message.hit, ...state.logs].slice(0, MAX_HITS) });
      } else if (message.kind === 'event' && message.event === 'state') {
        refresh();
      }
    },
  });
  return () => {
    client?.dispose();
    client = null;
  };
}

export async function refresh() {
  try {
    const [status, list, logResult] = await Promise.all([
      rpc({ name: 'status' }),
      rpc({ name: 'list' }),
      rpc({ name: 'logs', payload: { limit: MAX_HITS } }),
    ]);
    if (status.ok) {
      setState({ globalEnabled: status.data.globalEnabled === true, extensionConnected: true });
    } else {
      setState({
        lastError: status.error?.message || 'extension is not responding',
        extensionConnected: false,
      });
    }
    if (list.ok) setState({ rules: Array.isArray(list.data) ? list.data : [] });
    if (logResult.ok) setState({ logs: Array.isArray(logResult.data) ? logResult.data : [] });
    setState({ lastUpdated: new Date() });
  } catch (error) {
    setState({ extensionConnected: false, lastError: error.message });
  }
}

export async function changeGlobal(enabled) {
  setState({ globalEnabled: enabled });
  try {
    const result = await rpc({ name: 'global', payload: { enabled } });
    if (!result.ok) throw new Error(result.error?.message || 'global switch failed');
    setState({ lastError: '' });
    await refresh();
  } catch (error) {
    setState({ globalEnabled: !enabled, lastError: error.message });
  }
}

export async function switchScenario(ruleId, scenarioId) {
  try {
    const result = await rpc({ name: 'switch', payload: { ruleId, scenarioId } });
    if (!result.ok) throw new Error(result.error?.message || 'scenario switch failed');
    setState({ lastError: '' });
    await refresh();
  } catch (error) {
    setState({ lastError: error.message });
  }
}

export async function toggleRule(rule) {
  try {
    const result = await rpc({ name: rule.enabled ? 'disable' : 'enable', payload: { ruleId: rule.id } });
    if (!result.ok) throw new Error(result.error?.message || 'rule update failed');
    await refresh();
  } catch (error) {
    setState({ lastError: error.message });
  }
}
