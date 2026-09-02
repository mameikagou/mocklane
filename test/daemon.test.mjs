import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { isAllowedWebSocketOrigin, relayTimeoutForCommand, startDaemon } from '../src/daemon/server.mjs';

function openSocket(url, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, origin ? { origin } : undefined);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const onMessage = (data) => {
      let value;
      try { value = JSON.parse(String(data)); } catch { return; }
      if (!predicate(value)) return;
      socket.off('error', onError);
      resolve(value);
    };
    const onError = (error) => {
      socket.off('message', onMessage);
      reject(error);
    };
    socket.on('message', onMessage);
    socket.once('error', onError);
  });
}

test('daemon only accepts loopback and chrome-extension websocket origins', () => {
  assert.equal(isAllowedWebSocketOrigin('http://127.0.0.1:17321'), true);
  assert.equal(isAllowedWebSocketOrigin('http://localhost:17321'), true);
  assert.equal(isAllowedWebSocketOrigin('chrome-extension://abcdefghijklmnop'), true);
  assert.equal(isAllowedWebSocketOrigin('https://evil.example'), false);
  assert.equal(isAllowedWebSocketOrigin('http://192.168.1.2:17321'), false);
});

test('request relay timeout leaves margin for the page bridge', () => {
  assert.equal(relayTimeoutForCommand({ name: 'request', payload: { timeout: 3000 } }), 4000);
  assert.equal(relayTimeoutForCommand({ name: 'request' }), 11000);
  assert.equal(relayTimeoutForCommand({ name: 'status' }), 5000);
});

test('dashboard becomes available when it is built after daemon startup', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mocklane-daemon-'));
  const daemon = await startDaemon({ port: 0, projectRoot });
  const rootUrl = `http://127.0.0.1:${daemon.address.port}/`;
  try {
    assert.equal((await fetch(rootUrl)).status, 404);
    const dashboardDir = path.join(projectRoot, 'dist/dashboard');
    await fs.mkdir(dashboardDir, { recursive: true });
    await fs.writeFile(path.join(dashboardDir, 'index.html'), '<!doctype html><title>Mocklane test</title>');
    const response = await fetch(rootUrl);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Mocklane test/);
  } finally {
    await daemon.close();
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('daemon relays dashboard RPC to extension without owning rule data', async () => {
  const daemon = await startDaemon({ port: 0 });
  const url = `ws://127.0.0.1:${daemon.address.port}/ws`;
  const extension = await openSocket(url, 'chrome-extension://abcdefghijklmnop');
  const dashboard = await openSocket(url, `http://127.0.0.1:${daemon.address.port}`);
  extension.send(JSON.stringify({ kind: 'hello', role: 'extension' }));
  dashboard.send(JSON.stringify({ kind: 'hello', role: 'dashboard' }));
  await nextMessage(dashboard, (message) => message.kind === 'hello');
  const extensionRpc = nextMessage(extension, (message) => message.kind === 'rpc');
  const dashboardResult = nextMessage(dashboard, (message) => message.kind === 'rpc-result');
  dashboard.send(JSON.stringify({ kind: 'rpc', requestId: 'test-request', command: { name: 'status' } }));
  const request = await extensionRpc;
  extension.send(JSON.stringify({ kind: 'rpc-result', requestId: request.requestId, result: { ok: true, data: { globalEnabled: false } } }));
  const result = await dashboardResult;
  assert.deepEqual(result, { kind: 'rpc-result', requestId: 'test-request', result: { ok: true, data: { globalEnabled: false } } });

  const requestRpc = nextMessage(extension, (message) => message.kind === 'rpc');
  const requestResult = nextMessage(dashboard, (message) => message.kind === 'rpc-result');
  dashboard.send(JSON.stringify({
    kind: 'rpc',
    requestId: 'browser-request',
    command: {
      name: 'request',
      payload: { url: 'https://example.test/api', method: 'GET', headers: {}, timeout: 1000, native: false },
    },
  }));
  const browserRequest = await requestRpc;
  assert.equal(browserRequest.command.name, 'request');
  assert.equal(browserRequest.command.payload.url, 'https://example.test/api');
  extension.send(JSON.stringify({ kind: 'rpc-result', requestId: browserRequest.requestId, result: { ok: true, data: { status: 200, headers: {}, body: 'ok' } } }));
  const browserResult = await requestResult;
  assert.deepEqual(browserResult.result, { ok: true, data: { status: 200, headers: {}, body: 'ok' } });
  extension.close();
  dashboard.close();
  await daemon.close();
});
