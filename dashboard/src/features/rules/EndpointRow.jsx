import { Badge } from '../../ui/Badge.jsx';
import { Select } from '../../ui/Select.jsx';
import { Switch } from '../../ui/Switch.jsx';
import { switchScenario, toggleRule } from '../../lib/store.js';

function methodTone(method) {
  return { GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'danger' }[method] || 'muted';
}

export function EndpointRow({ rule }) {
  return <article className={`endpoint-row ${rule.enabled ? '' : 'is-muted'}`}>
    <div className="endpoint-main"><div className="endpoint-line"><Badge tone={methodTone(rule.method)}>{rule.method}</Badge><code>{rule.endpoint}</code></div><div className="endpoint-meta"><span>{rule.matchType} match</span><span className="meta-separator">·</span><span>{rule.scenarios.length} scenario{rule.scenarios.length === 1 ? '' : 's'}</span><span className="meta-separator">·</span><span className="rule-id">{rule.id}</span></div></div>
    <div className="endpoint-controls"><div className="scenario-control"><span className="control-label">scenario</span><Select value={rule.activeScenarioId} ariaLabel={`Scenario for ${rule.endpoint}`} onChange={(value) => switchScenario(rule.id, value)} options={rule.scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }))} /></div><Switch checked={rule.enabled} onChange={() => toggleRule(rule)} label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.endpoint}`} /></div>
  </article>;
}
