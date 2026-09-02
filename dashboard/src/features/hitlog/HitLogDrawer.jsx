import { useState } from 'react';
import { Icon } from '../../ui/Icon.jsx';
import { useMocklane } from '../../lib/store.js';
import { HitLog } from './HitLog.jsx';

/** 日志是 agent 的遥测,不是人的主视图:默认收起,点击展开。 */
export function HitLogDrawer() {
  const [open, setOpen] = useState(false);
  const logs = useMocklane((s) => s.logs);
  return <div className={`hitlog-drawer ${open ? 'is-open' : ''}`}>
    <button className="drawer-toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="drawer-chevron"><Icon name="chevron" size={14} /></span>
      <span className="drawer-title">Hit log</span>
      <span className="drawer-count">{logs.length} events</span>
    </button>
    {open && (logs.length
      ? <div className="drawer-body"><HitLog logs={logs} /></div>
      : <div className="log-empty drawer-empty"><strong>No traffic captured</strong><span>Matched requests will appear here in real time.</span></div>)}
  </div>;
}
