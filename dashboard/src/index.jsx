/* Hallmark · macrostructure: Workbench · genre: technical-utilitarian */
/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V4 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Badge } from './ui/Badge.jsx';
import { Button } from './ui/Button.jsx';
import { Switch } from './ui/Switch.jsx';
import { ConnectionStatus } from './features/ConnectionStatus.jsx';
import { EndpointList } from './features/EndpointList.jsx';
import { HitLog } from './features/HitLog.jsx';

function Icon({ name, size = 16 }) {
  const paths = {
    pulse: <><path d="M3 12h3l2-7 4 14 2-7h4" /><path d="M21 12h-3" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-3L3 11M3 5v6h6M4 13a8 8 0 0 0 14.8 3L21 13m0 6v-6h-6" /></>,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.pulse}</svg>;
}

function EmptyState({ title, body }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="pulse" size={20} /></div><strong>{title}</strong><span>{body}</span></div>;
}

function App() {
  const socketRef = useRef(null);
  const pendingRef = useRef(new Map());
  const requestIdRef = useRef(0);
  const [daemonConnected, setDaemonConnected] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [lastError, setLastError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const socketUrl = useMemo(() => {
    const host = window.location.hostname || '127.0.0.1';
    const port = window.location.port || '17321';
    return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host}:${port}/ws`;
  }, []);

  const sendRpc = useCallback((command) => new Promise((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      reject(new Error('daemon is not connected'));
      return;
    }
    const requestId = `dashboard_${Date.now().toString(36)}_${requestIdRef.current++}`;
    pendingRef.current.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ kind: 'rpc', requestId, command }));
    window.setTimeout(() => {
      const pending = pendingRef.current.get(requestId);
      if (!pending) return;
      pendingRef.current.delete(requestId);
      reject(new Error('extension response timed out'));
    }, 5500);
  }), []);

  const refresh = useCallback(async () => {
    try {
      const [status, list, logResult] = await Promise.all([
        sendRpc({ name: 'status' }),
        sendRpc({ name: 'list' }),
        sendRpc({ name: 'logs', payload: { limit: 80 } }),
      ]);
      if (status.ok) {
        setGlobalEnabled(status.data.globalEnabled === true);
        setExtensionConnected(true);
      } else {
        setLastError(status.error?.message || 'extension is not responding');
        setExtensionConnected(false);
      }
      if (list.ok) setRules(Array.isArray(list.data) ? list.data : []);
      if (logResult.ok) setLogs(Array.isArray(logResult.data) ? logResult.data : []);
      setLastUpdated(new Date());
    } catch (error) {
      setExtensionConnected(false);
      setLastError(error.message);
    }
  }, [sendRpc]);

  useEffect(() => {
    let disposed = false;
    let retryAttempt = 0;
    let reconnectTimer;
    const rejectPending = (message) => {
      for (const pending of pendingRef.current.values()) pending.reject(new Error(message));
      pendingRef.current.clear();
    };
    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = Math.min(8000, 1000 * (2 ** retryAttempt));
      retryAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };
    const connect = () => {
      if (disposed) return;
      let socket;
      try { socket = new WebSocket(socketUrl); } catch {
        setDaemonConnected(false);
        setLastError('cannot reach daemon; retrying connection');
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;
      socket.onopen = () => {
        if (disposed) return;
        retryAttempt = 0;
        setDaemonConnected(true);
        setLastError('');
        socket.send(JSON.stringify({ kind: 'hello', role: 'dashboard' }));
      };
      socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.kind === 'hello') {
          setExtensionConnected(message.extensionConnected === true);
          refresh();
        } else if (message.kind === 'rpc-result') {
          const pending = pendingRef.current.get(message.requestId);
          if (!pending) return;
          pendingRef.current.delete(message.requestId);
          pending.resolve(message.result);
        } else if (message.kind === 'event' && message.event === 'connections') {
          setExtensionConnected(message.extensionConnected === true);
          if (message.extensionConnected) refresh();
        } else if (message.kind === 'event' && message.event === 'hit' && message.hit) {
          setLogs((current) => [message.hit, ...current].slice(0, 80));
        } else if (message.kind === 'event' && message.event === 'state') {
          refresh();
        }
      };
      socket.onerror = () => {
        if (!disposed) setLastError('cannot reach daemon; retrying connection');
      };
      socket.onclose = () => {
        if (disposed) return;
        setDaemonConnected(false);
        setExtensionConnected(false);
        rejectPending('daemon connection closed');
        scheduleReconnect();
      };
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
      rejectPending('dashboard closed');
    };
  }, [refresh, socketUrl]);

  const changeGlobal = async (enabled) => {
    setGlobalEnabled(enabled);
    try {
      const result = await sendRpc({ name: 'global', payload: { enabled } });
      if (!result.ok) throw new Error(result.error?.message || 'global switch failed');
      setLastError('');
      await refresh();
    } catch (error) {
      setGlobalEnabled(!enabled);
      setLastError(error.message);
    }
  };

  const switchScenario = async (ruleId, scenarioId) => {
    try {
      const result = await sendRpc({ name: 'switch', payload: { ruleId, scenarioId } });
      if (!result.ok) throw new Error(result.error?.message || 'scenario switch failed');
      setLastError('');
      await refresh();
    } catch (error) { setLastError(error.message); }
  };

  const toggleRule = async (rule) => {
    try {
      const result = await sendRpc({ name: rule.enabled ? 'disable' : 'enable', payload: { ruleId: rule.id } });
      if (!result.ok) throw new Error(result.error?.message || 'rule update failed');
      await refresh();
    } catch (error) { setLastError(error.message); }
  };

  return <div className="app-shell min-h-screen bg-ml-bg text-ml-ink">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><Icon name="pulse" size={18} /></div><div><div className="brand-name">Mocklane</div><div className="brand-subtitle">browser API workspace</div></div></div>
      <div className="topbar-actions"><ConnectionStatus daemonConnected={daemonConnected} extensionConnected={extensionConnected} /><Button variant="ghost" onClick={refresh} title="Refresh state"><Icon name="refresh" size={15} />Refresh</Button></div>
    </header>

    <main className="workspace">
      <section className="overview-grid">
        <div className="hero-panel panel">
          <h1>API traffic, under your control.</h1>
          <p>Define deterministic responses in the CLI, then use this view to switch scenarios while the browser stays open.</p>
          <div className="hero-meta"><Badge tone={extensionConnected ? 'success' : 'muted'}>{extensionConnected ? 'Extension ready' : 'Waiting for extension'}</Badge><span className="muted-text">Port 17321 · IndexedDB-owned state</span></div>
        </div>
        <div className="global-panel panel">
          <div className="panel-heading"><div className="panel-title-group"><h2>Global mock switch</h2><p className="panel-description">Gate every enabled route with one control.</p></div><Switch checked={globalEnabled} onChange={changeGlobal} disabled={!extensionConnected} label="Toggle all mocks" /></div>
          <div className={`global-state ${globalEnabled ? 'is-on' : ''}`}><span className="state-pulse" />{globalEnabled ? 'Mocking is active' : 'Pass-through mode'}<span className="state-detail">{globalEnabled ? 'matching enabled rules return scenarios' : 'browser requests use native responses'}</span></div>
          <div className="global-footer"><span>{rules.length} endpoint{rules.length === 1 ? '' : 's'}</span><span>{logs.length} recent hit{logs.length === 1 ? '' : 's'}</span></div>
        </div>
      </section>

      {lastError && <div className="notice notice-error"><span className="notice-dot" />{lastError}</div>}

      <section className="content-grid">
        <div className="panel endpoint-panel"><div className="section-heading"><div className="panel-title-group"><h2>Endpoints</h2><p className="panel-description">Configured browser routes and their active response.</p></div><span className="count-label">{rules.length} configured</span></div>{rules.length ? <EndpointList rules={rules} onSwitch={switchScenario} onToggle={toggleRule} /> : <EmptyState title="No endpoints yet" body={<><code>mocklane apply --json …</code> to add your first rule.</>} />}</div>
        <div className="panel log-panel"><div className="section-heading"><div className="panel-title-group"><h2>Hit log</h2><p className="panel-description">Latest requests matched by the extension.</p></div><span className="count-label">{logs.length} events</span></div><HitLog logs={logs} /></div>
      </section>
    </main>
    <footer className="footer"><span>Mocklane v1</span><span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for state'}</span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
