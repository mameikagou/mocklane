import { Switch } from '../../ui/Switch.jsx';
import { changeGlobal, useMocklane } from '../../lib/store.js';

export function GlobalGatePanel() {
  const extensionConnected = useMocklane((s) => s.extensionConnected);
  const globalEnabled = useMocklane((s) => s.globalEnabled);
  const ruleCount = useMocklane((s) => s.rules.length);
  const hitCount = useMocklane((s) => s.logs.length);
  return <div className="global-panel panel">
    <div className="panel-heading"><div className="panel-title-group"><h2>Global mock switch</h2><p className="panel-description">Gate every enabled route with one control.</p></div><Switch checked={globalEnabled} onChange={changeGlobal} disabled={!extensionConnected} label="Toggle all mocks" /></div>
    <div className={`global-state ${globalEnabled ? 'is-on' : ''}`}><span className="state-pulse" />{globalEnabled ? 'Mocking is active' : 'Pass-through mode'}<span className="state-detail">{globalEnabled ? 'matching enabled rules return scenarios' : 'browser requests use native responses'}</span></div>
    <div className="global-footer"><span>{ruleCount} endpoint{ruleCount === 1 ? '' : 's'}</span><span>{hitCount} recent hit{hitCount === 1 ? '' : 's'}</span></div>
  </div>;
}
