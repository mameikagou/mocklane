import { Badge } from '../../ui/Badge.jsx';

function timeLabel(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function HitLog({ logs }) {
  return <div className="log-table-wrap"><table className="log-table"><thead><tr><th>Time</th><th>Request</th><th>Scenario</th><th>Status</th></tr></thead><tbody>{logs.map((hit) => <tr key={hit.id}><td className="log-time">{timeLabel(hit.timestamp)}</td><td><div className="log-request"><Badge tone="muted">{hit.method}</Badge><span title={hit.url}>{hit.url}</span></div><div className="log-rule">{hit.ruleId}</div></td><td><span className="scenario-name">{hit.scenarioId}</span></td><td><Badge tone={Number(hit.status) >= 400 ? 'danger' : 'success'}>{hit.status}</Badge></td></tr>)}</tbody></table></div>;
}
