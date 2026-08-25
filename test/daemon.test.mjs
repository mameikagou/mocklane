import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { isAllowedWebSocketOrigin, startDaemon } from '../src/daemon/server.mjs';

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
  extension.close();
  dashboard.close();
  await daemon.close();
});
