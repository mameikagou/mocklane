import { useMocklane } from '../lib/store.js';

export function Footer() {
  const lastUpdated = useMocklane((s) => s.lastUpdated);
  return <footer className="footer"><span>Mocklane v1</span><span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for state'}</span></footer>;
}
