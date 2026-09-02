import { Badge } from '../../ui/Badge.jsx';
import { useMocklane } from '../../lib/store.js';

export function ConnectionStatus() {
  const daemonConnected = useMocklane((s) => s.daemonConnected);
  const extensionConnected = useMocklane((s) => s.extensionConnected);
  const tone = extensionConnected ? 'success' : daemonConnected ? 'warning' : 'muted';
  const label = extensionConnected ? 'Extension connected' : daemonConnected ? 'Daemon connected' : 'Offline';
  return <div className="connection-status"><Badge tone={tone}>{label}</Badge><span className="connection-caption">{extensionConnected ? 'relay + browser ready' : daemonConnected ? 'waiting for browser bridge' : 'local daemon unavailable'}</span></div>;
}
