import { installInterceptors } from '../core/interceptor.mjs';

/*
 * This file is an Rspack entry. The generated dist/extension/interceptor.js
 * is the only MAIN-world script loaded by Chrome; matching and response logic
 * comes directly from src/core/interceptor.mjs and src/core/matcher.mjs.
 */
(function installMocklaneMainWorld() {
  'use strict';

  if (window.__mocklaneInterceptorInstalled) return;
  window.__mocklaneInterceptorInstalled = true;

  let state = { globalEnabled: false, rules: [] };
  installInterceptors(window, () => state, (hit) => {
    window.postMessage({
      source: 'mocklane-main',
      type: 'hit',
      hit: { ...hit, timestamp: new Date().toISOString() },
    }, '*');
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'mocklane-bridge') return;
    if (event.data.type === 'state-switch') {
      // State is intentionally applied in two messages: the switch arrives
      // before the rule list, so enabling never races with stale rules.
      state = { ...state, globalEnabled: event.data.globalEnabled === true };
    } else if (event.data.type === 'state-rules') {
      state = { ...state, rules: Array.isArray(event.data.rules) ? event.data.rules : [] };
    }
  });
}());
