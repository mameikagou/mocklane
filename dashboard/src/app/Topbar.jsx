import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { ConnectionStatus } from '../features/connection/ConnectionStatus.jsx';
import { refresh } from '../lib/store.js';
import { useTheme } from '../lib/theme.js';

export function Topbar() {
  const [theme, toggleTheme] = useTheme();
  return <header className="topbar">
    <div className="brand-lockup"><div className="brand-mark"><Icon name="pulse" size={18} /></div><div><div className="brand-name">Mocklane</div><div className="brand-subtitle">browser API workspace</div></div></div>
    <div className="topbar-actions">
      <ConnectionStatus />
      <Button variant="ghost" onClick={toggleTheme} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />{theme === 'light' ? 'Dark' : 'Light'}</Button>
      <Button variant="ghost" onClick={refresh} title="Refresh state"><Icon name="refresh" size={15} />Refresh</Button>
    </div>
  </header>;
}
