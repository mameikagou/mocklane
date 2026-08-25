/* global chrome, window */
(function installMocklaneBridge() {
  'use strict';

  function syncMain(state) {
    var safeState = state || { globalEnabled: false, rules: [] };
    // Keep these as two ordered postMessage calls. The MAIN world switches off
    // or on first, then receives the rule list, avoiding an enabled-rule race.
    window.postMessage({
      source: 'mocklane-bridge',
      type: 'state-switch',
      globalEnabled: safeState.globalEnabled === true
    }, '*');
    window.postMessage({
      source: 'mocklane-bridge',
      type: 'state-rules',
      rules: safeState.globalEnabled === true && Array.isArray(safeState.rules) ? safeState.rules : []
    }, '*');
  }

  chrome.runtime.onMessage.addListener(function onRuntimeMessage(message, sender, sendResponse) {
    if (message && message.type === 'sync-state') {
      syncMain(message.state);
      sendResponse({ ok: true });
    }
    return true;
  });

  window.addEventListener('message', function receiveHit(event) {
    if (event.source !== window || !event.data || event.data.source !== 'mocklane-main' || event.data.type !== 'hit') return;
    chrome.runtime.sendMessage({ type: 'hit', hit: event.data.hit });
  });

  chrome.runtime.sendMessage({ type: 'get-state' }, function initialState(state) {
    if (chrome.runtime.lastError) return;
    syncMain(state);
  });
}());
