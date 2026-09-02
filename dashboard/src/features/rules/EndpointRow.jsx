import { useState } from 'react';
import { Badge } from '../../ui/Badge.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { Select } from '../../ui/Select.jsx';
import { Switch } from '../../ui/Switch.jsx';
import { switchScenario, toggleRule, useMocklane } from '../../lib/store.js';
import { methodTone, statusTone } from '../../lib/tones.js';
import { ago } from '../../lib/time.js';

function formatBody(body) {
  if (body === '' || body == null) return null;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function pageHost(pageUrl) {
  try {
    return new URL(pageUrl || '').host;
  } catch {
    return '';
  }
}

// "Live" = present in the store's rolling window of recent hits (live socket
// events + the initial fetch). Grouping by URL turns the stream into "which
// URLs are hitting this rule right now"; old hits age out of the window, so
// this can never read as history.
function groupLiveHits(logs, ruleId) {
  const byUrl = new Map();
  for (const hit of logs) {
    if (hit.ruleId !== ruleId) continue;
    const entry = byUrl.get(hit.url);
    if (entry) {
      entry.count += 1;
      if (!entry.host) entry.host = pageHost(hit.pageUrl);
    } else {
      byUrl.set(hit.url, { url: hit.url, count: 1, last: hit.timestamp, host: pageHost(hit.pageUrl) });
    }
  }
  // The stream is newest-first, so first sight of a URL is its latest hit.
  return [...byUrl.values()].slice(0, 20);
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

function LiveHits({ entries }) {
  return <div className="live-hits">
    <div className="live-hits-head">live urls · {entries.length}</div>
    {entries.map((entry) => <div className="live-hit-row" key={entry.url}>
      <span className="live-url" title={entry.url}>{entry.url}</span>
      {entry.host && <span className="live-host" title="page that triggered the hit">{entry.host}</span>}
      <span className="live-count">×{entry.count}</span>
      <span className="live-ago">{ago(entry.last)}</span>
    </div>)}
  </div>;
}

export function EndpointRow({ rule }) {
  const [open, setOpen] = useState(false);
  const logs = useMocklane((s) => s.logs);
  const liveHits = groupLiveHits(logs, rule.id);
  return <article className={`endpoint-row ${rule.enabled ? '' : 'is-muted'} ${open ? 'is-open' : ''}`}>
    <button className="endpoint-summary" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="endpoint-chevron"><Icon name="chevron" size={14} /></span>
      <div className="endpoint-main"><div className="endpoint-line"><Badge tone={methodTone(rule.method)}>{rule.method}</Badge><code>{rule.endpoint}</code></div><div className="endpoint-meta"><span>{rule.matchType} match</span><span className="meta-separator">·</span><span>{rule.scenarios.length} scenario{rule.scenarios.length === 1 ? '' : 's'}</span><span className="meta-separator">·</span><span className="rule-id">{rule.id}</span>{rule.page ? <><span className="meta-separator">·</span><span className="page-scope" title={`Only fires on pages matching: ${rule.page}`}>⤳ {rule.page}</span></> : null}{liveHits.length > 0 ? <><span className="meta-separator">·</span><span className="live-chip">{liveHits.length} live</span></> : null}</div></div>
    </button>
    <div className="endpoint-controls"><div className="scenario-control"><span className="control-label">scenario</span><Select value={rule.activeScenarioId} ariaLabel={`Scenario for ${rule.endpoint}`} onChange={(value) => switchScenario(rule.id, value)} options={rule.scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }))} /></div><Switch checked={rule.enabled} onChange={() => toggleRule(rule)} label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.endpoint}`} /></div>
    {open && <div className="endpoint-detail">{rule.scenarios.map((scenario) => <ScenarioCard scenario={scenario} isActive={scenario.id === rule.activeScenarioId} key={scenario.id} />)}{liveHits.length > 0 && <LiveHits entries={liveHits} />}</div>}
  </article>;
}
