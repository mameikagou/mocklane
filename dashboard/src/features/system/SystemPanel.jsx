import { useMocklane } from '../../lib/store.js';

/** 系统状态位:gate + 桥 + armed 规则数,一眼扫描。不放营销文案。 */
export function SystemPanel() {
  const globalEnabled = useMocklane((s) => s.globalEnabled);
  const extensionConnected = useMocklane((s) => s.extensionConnected);
  const daemonConnected = useMocklane((s) => s.daemonConnected);
  const rules = useMocklane((s) => s.rules);

  const armed = rules.filter((rule) => rule.enabled).length;
  const bridge = extensionConnected ? 'bridge ready' : daemonConnected ? 'daemon only' : 'offline';

  return <div className="system-panel panel">
    <div className="system-label">gate</div>
    <div className={`system-headline ${globalEnabled ? 'is-live' : ''}`}>{globalEnabled ? 'Gate open' : 'Gate closed'}</div>
    <div className="system-state">{globalEnabled ? 'enabled rules are serving scenarios' : 'all traffic passes through untouched'}</div>
    <div className="system-meta"><span>{bridge}</span><span className="meta-separator">·</span><span>{armed} of {rules.length} armed</span></div>
  </div>;
}
