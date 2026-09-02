/* Mocklane · Arena 主题 · macrostructure: Workbench · genre: atmospheric technical console
 * App 只做组合：状态在 lib/store.js，传输在 lib/client.js，功能在各 features/*。 */
import { useEffect } from 'react';
import { initMocklane, useMocklane } from '../lib/store.js';
import { Topbar } from './Topbar.jsx';
import { Footer } from './Footer.jsx';
import { SystemPanel } from '../features/system/SystemPanel.jsx';
import { GlobalGatePanel } from '../features/gate/GlobalGatePanel.jsx';
import { EndpointsPanel } from '../features/rules/EndpointsPanel.jsx';
import { NowServingPanel } from '../features/now-serving/NowServingPanel.jsx';
import { HitLogDrawer } from '../features/hitlog/HitLogDrawer.jsx';

export function App() {
  useEffect(() => initMocklane(), []);
  const lastError = useMocklane((s) => s.lastError);

  return <div className="app-shell">
    <div className="mc-field" aria-hidden="true"><span className="mc-field__ring mc-field__ring--a" /><span className="mc-field__ring mc-field__ring--b" /></div>
    <Topbar />

    <main className="workspace">
      <section className="overview-grid">
        <SystemPanel />
        <GlobalGatePanel />
      </section>

      {lastError && <div className="notice notice-error"><span className="notice-dot" />{lastError}</div>}

      <section className="content-grid">
        <EndpointsPanel />
        <NowServingPanel><HitLogDrawer /></NowServingPanel>
      </section>
    </main>
    <Footer />
  </div>;
}
