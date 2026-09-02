import { Badge } from '../../ui/Badge.jsx';
import { useMocklane } from '../../lib/store.js';
import { ago } from '../../lib/time.js';

function scenarioName(rule) {
  const scenario = rule.scenarios.find((candidate) => candidate.id === rule.activeScenarioId);
  return scenario ? scenario.name : rule.activeScenarioId;
}

function ServingRow({ rule }) {
  return <div className={`serving-row ${rule.enabled ? '' : 'is-muted'}`}>
    <div className="serving-line">
      <code className="serving-endpoint">{rule.endpoint}</code>
      <span className="serving-scenario">{scenarioName(rule)}</span>
    </div>
    <div className="serving-meta">
      {rule.hitCount > 0
        ? <><span>{ago(rule.lastHitAt)}</span><span className="meta-separator">·</span><span>{rule.hitCount} hit{rule.hitCount === 1 ? '' : 's'}</span></>
        : <Badge tone="muted">no hits</Badge>}
      {!rule.enabled && <><span className="meta-separator">·</span><span>disabled</span></>}
    </div>
  </div>;
}

export function NowServingPanel({ children }) {
  const rules = useMocklane((s) => s.rules);
  const armed = rules.filter((rule) => rule.enabled);
  return <div className="panel serving-panel">
    <div className="section-heading"><div className="panel-title-group"><h2>Now serving</h2></div><span className="count-label">{armed.length} armed</span></div>
    {rules.length
      ? <div className="serving-list">{rules.map((rule) => <ServingRow rule={rule} key={rule.id} />)}</div>
      : <div className="log-empty drawer-empty"><strong>No endpoints yet</strong><span>Rules applied through the CLI will report their live scenario here.</span></div>}
    {children}
  </div>;
}
