import { createState, recordHit } from '../core/state.mjs';
import { normalizeState } from '../core/schema.mjs';
import { executeStoredCommand } from '../core/command-runner.mjs';
import { createWebSocketKeepalive } from './keepalive.mjs';

/*
 * Rspack entry for the MV3 service worker. IndexedDB and the daemon socket
 * live here, while rule normalization, matching, mutations, and hit shaping
 * are imported from src/core so production and unit tests share one path.
 */
(function installMocklaneBackground() {
  'use strict';

  const DB_NAME = 'mocklane';
  const DB_VERSION = 1;
  const STORE = 'state';
  const STATE_KEY = 'singleton';
  const MAX_LOGS = 500;
  let daemonSocket = null;
  let daemonReconnectTimer = null;
  let commandQueue = Promise.resolve();
  const daemonKeepalive = createWebSocketKeepalive({ getSocket: () => daemonSocket });

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
  }

  async function readState() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(STATE_KEY);
      request.onsuccess = () => resolve(normalizeState(request.result || createState()));
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    });
  }

  async function writeState(state) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(normalizeState(state), STATE_KEY);
      transaction.oncomplete = () => resolve(state);
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB write failed'));
    });
  }

  function syncTabs(state) {
    chrome.tabs.query({}, (tabs) => {
      (tabs || []).forEach((tab) => {
        if (tab.id == null) return;
        chrome.tabs.sendMessage(tab.id, { type: 'sync-state', state }, () => {
          // Content scripts are absent on chrome:// and extension pages.
          void chrome.runtime.lastError;
        });
      });
    });
  }

  function sendDaemon(value) {
    if (daemonSocket && daemonSocket.readyState === WebSocket.OPEN) daemonSocket.send(JSON.stringify(value));
  }

  function commandError(error) {
    return { ok: false, error: { code: error.code || 'storage_error', message: error.message || String(error) } };
  }

  function mutate(command) {
    commandQueue = commandQueue.then(async () => executeStoredCommand(command, {
      readState,
      writeState,
      // executeStoredCommand calls this only after a meaningful mutation.
      onState: async (state) => {
        syncTabs(state);
        sendDaemon({ kind: 'event', event: 'state', state });
      },
    }));
    commandQueue = commandQueue.catch(commandError);
    return commandQueue;
  }

  function recordBrowserHit(rawHit) {
    commandQueue = commandQueue.then(async () => {
      const current = await readState();
      const { state, hit } = recordHit(current, rawHit || {});
      await writeState(state);
      // Hit events are intentionally separate from state broadcasts. A busy
      // page should update the live log without making every tab re-sync.
      sendDaemon({ kind: 'event', event: 'hit', hit });
    });
    commandQueue = commandQueue.catch(() => undefined);
  }

  function connectDaemon() {
    if (daemonSocket && (daemonSocket.readyState === WebSocket.CONNECTING || daemonSocket.readyState === WebSocket.OPEN)) return;
    daemonKeepalive.stop();
    let socket;
    try {
      socket = new WebSocket('ws://127.0.0.1:17321/ws');
    } catch {
      scheduleReconnect();
      return;
    }
    daemonSocket = socket;
    socket.onopen = () => {
      if (daemonSocket !== socket) return;
      daemonKeepalive.start();
      sendDaemon({ kind: 'hello', role: 'extension' });
    };
    socket.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.kind !== 'rpc') return;
      mutate(message.command).then((result) => {
        if (daemonSocket && daemonSocket.readyState === WebSocket.OPEN) {
          sendDaemon({ kind: 'rpc-result', requestId: message.requestId, result });
        }
      });
    };
    socket.onerror = () => {
      try { socket.close(); } catch { /* socket is already closed */ }
    };
    socket.onclose = () => {
      if (daemonSocket !== socket) return;
      daemonKeepalive.stop();
      daemonSocket = null;
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (daemonReconnectTimer) return;
    daemonReconnectTimer = setTimeout(() => {
      daemonReconnectTimer = null;
      connectDaemon();
    }, 3000);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return true;
    if (message.type === 'get-state') {
      readState().then(sendResponse).catch(() => sendResponse(createState()));
      return true;
    }
    if (message.type === 'hit') {
      recordBrowserHit(message.hit);
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'command') {
      mutate(message.command || {}).then(sendResponse);
      return true;
    }
    return true;
  });

  chrome.runtime.onInstalled.addListener(() => {
    readState().then(writeState).catch(() => undefined);
    connectDaemon();
  });
  chrome.runtime.onStartup.addListener(connectDaemon);
  if (chrome.action?.onClicked) {
    chrome.action.onClicked.addListener(() => {
      chrome.tabs.create({ url: 'http://127.0.0.1:17321/' });
    });
  }
  connectDaemon();
}());
