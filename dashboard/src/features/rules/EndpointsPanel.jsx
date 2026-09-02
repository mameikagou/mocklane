import { EmptyState } from '../../ui/EmptyState.jsx';
import { useMocklane } from '../../lib/store.js';
import { EndpointRow } from './EndpointRow.jsx';

export function EndpointsPanel() {
  const rules = useMocklane((s) => s.rules);
  return <div className="panel endpoint-panel">
    <div className="section-heading"><div className="panel-title-group"><h2>Endpoints</h2><p className="panel-description">Configured browser routes and their active response.</p></div><span className="count-label">{rules.length} configured</span></div>
    {rules.length
      ? <div className="endpoint-list">{rules.map((rule) => <EndpointRow rule={rule} key={rule.id} />)}</div>
      : <EmptyState title="No endpoints yet" body={<><code>mocklane apply --json …</code> to add your first rule.</>} />}
  </div>;
}
