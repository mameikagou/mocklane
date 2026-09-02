import { useMocklane } from '../../lib/store.js';
import { HitLog } from './HitLog.jsx';

export function HitLogPanel() {
  const logs = useMocklane((s) => s.logs);
  return <div className="panel log-panel">
    <div className="section-heading"><div className="panel-title-group"><h2>Hit log</h2><p className="panel-description">Latest requests matched by the extension.</p></div><span className="count-label">{logs.length} events</span></div>
    {logs.length
      ? <HitLog logs={logs} />
      : <div className="log-empty"><div className="empty-icon"><span className="empty-bars" /></div><strong>No traffic captured</strong><span>Matched requests will appear here in real time.</span></div>}
  </div>;
}
