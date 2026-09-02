import { Badge } from '../../ui/Badge.jsx';
import { useMocklane } from '../../lib/store.js';

export function HeroPanel() {
  const extensionConnected = useMocklane((s) => s.extensionConnected);
  return <div className="hero-panel panel">
    <h1>API traffic, under your control.</h1>
    <p>Define deterministic responses in the CLI, then use this view to switch scenarios while the browser stays open.</p>
    <div className="hero-meta"><Badge tone={extensionConnected ? 'success' : 'muted'}>{extensionConnected ? 'Extension ready' : 'Waiting for extension'}</Badge><span className="muted-text">Port 17321 · IndexedDB-owned state</span></div>
  </div>;
}
