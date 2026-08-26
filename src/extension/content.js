/* global chrome, window */
(function installMocklaneBridge() {
  'use strict';

  var requestCounter = 0;
  var pendingRequests = new Map();

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
      return true;
    }
    if (message && message.type === 'browser-request') {
      var requestId = 'page_request_' + Date.now().toString(36) + '_' + requestCounter++;
      pendingRequests.set(requestId, sendResponse);
      window.postMessage({
        source: 'mocklane-bridge',
        type: 'browser-request',
        requestId: requestId,
        request: message.request,
      }, '*');
      return true;
    }
    return true;
  });

  window.addEventListener('message', function receiveHit(event) {
    if (event.source !== window || !event.data || event.data.source !== 'mocklane-main' || event.data.type !== 'hit') return;
    chrome.runtime.sendMessage({ type: 'hit', hit: event.data.hit });
  });

  window.addEventListener('message', function receiveBrowserResponse(event) {
    if (event.source !== window || !event.data || event.data.source !== 'mocklane-main' || event.data.type !== 'browser-response') return;
    var sendResponse = pendingRequests.get(String(event.data.requestId));
    if (!sendResponse) return;
    pendingRequests.delete(String(event.data.requestId));
    sendResponse(event.data.result || { ok: false, error: { code: 'empty_result', message: 'page returned no request result' } });
  });

  chrome.runtime.sendMessage({ type: 'get-state' }, function initialState(state) {
    if (chrome.runtime.lastError) return;
    syncMain(state);
  });
}());
