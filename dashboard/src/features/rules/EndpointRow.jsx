import { useState } from 'react';
import { Badge } from '../../ui/Badge.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { Select } from '../../ui/Select.jsx';
import { Switch } from '../../ui/Switch.jsx';
import { switchScenario, toggleRule } from '../../lib/store.js';

function methodTone(method) {
  return { GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'danger' }[method] || 'muted';
}

function statusTone(status) {
  const code = Number(status);
  if (code >= 400) return 'danger';
  if (code >= 300) return 'info';
  return 'success';
}

function formatBody(body) {
  if (body === '' || body == null) return null;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function ScenarioCard({ scenario, isActive }) {
  const body = formatBody(scenario.body);
  const headerEntries = Object.entries(scenario.headers || {});
  return <div className={`scenario-card ${isActive ? 'is-active' : ''}`}>
    <div className="scenario-head">
      <span className="scenario-title">{scenario.name}</span>
      <span className="scenario-id">{scenario.id}</span>
      <Badge tone={statusTone(scenario.status)}>{scenario.status}</Badge>
      {isActive && <Badge tone="warning">active</Badge>}
    </div>
    {headerEntries.length > 0 && <div className="scenario-headers">{headerEntries.map(([key, value]) => <div className="scenario-header-line" key={key}><span className="scenario-header-key">{key}</span><span>{value}</span></div>)}</div>}
    {body
      ? <pre className="scenario-body">{body}</pre>
      : <div className="scenario-body-empty">empty body</div>}
  </div>;
}

export function EndpointRow({ rule }) {
  const [open, setOpen] = useState(false);
  return <article className={`endpoint-row ${rule.enabled ? '' : 'is-muted'} ${open ? 'is-open' : ''}`}>
    <button className="endpoint-summary" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="endpoint-chevron"><Icon name="chevron" size={14} /></span>
      <div className="endpoint-main"><div className="endpoint-line"><Badge tone={methodTone(rule.method)}>{rule.method}</Badge><code>{rule.endpoint}</code></div><div className="endpoint-meta"><span>{rule.matchType} match</span><span className="meta-separator">·</span><span>{rule.scenarios.length} scenario{rule.scenarios.length === 1 ? '' : 's'}</span><span className="meta-separator">·</span><span className="rule-id">{rule.id}</span></div></div>
    </button>
    <div className="endpoint-controls"><div className="scenario-control"><span className="control-label">scenario</span><Select value={rule.activeScenarioId} ariaLabel={`Scenario for ${rule.endpoint}`} onChange={(value) => switchScenario(rule.id, value)} options={rule.scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }))} /></div><Switch checked={rule.enabled} onChange={() => toggleRule(rule)} label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.endpoint}`} /></div>
    {open && <div className="endpoint-detail">{rule.scenarios.map((scenario) => <ScenarioCard scenario={scenario} isActive={scenario.id === rule.activeScenarioId} key={scenario.id} />)}</div>}
  </article>;
}
