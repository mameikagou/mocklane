import { installInterceptors } from '../core/interceptor.mjs';
import { executeBrowserRequest } from '../core/browser-request.mjs';

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
  // Capture this before installing the wrapper. The request command can use
  // it explicitly with --native to exercise the page's real network path.
  const nativeFetch = window.fetch;
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
    } else if (event.data.type === 'browser-request' && event.data.requestId) {
      executeBrowserRequest(event.data.request, {
        fetchImpl: window.fetch,
        nativeFetch,
        fetchThis: window,
      }).then((result) => {
        window.postMessage({
          source: 'mocklane-main',
          type: 'browser-response',
          requestId: String(event.data.requestId),
          result,
        }, '*');
      });
    }
  });
}());
