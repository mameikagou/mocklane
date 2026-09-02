import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { normalizeJourney, parseWaitTimeout, waitForHit } from '../bin/mocklane.js';
import { startDaemon } from '../src/daemon/server.mjs';

function openSocket(url, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, origin ? { origin } : undefined);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

test('parseWaitTimeout enforces a bounded positive integer', () => {
  assert.equal(parseWaitTimeout(undefined), 15000);
  assert.equal(parseWaitTimeout('3000'), 3000);
  assert.throws(() => parseWaitTimeout('0'), /invalid_timeout|timeout must be/);
  assert.throws(() => parseWaitTimeout('-5'));
  assert.throws(() => parseWaitTimeout('abc'));
  assert.throws(() => parseWaitTimeout('600001'));
  try { parseWaitTimeout('0'); } catch (error) { assert.equal(error.code, 'invalid_timeout'); }
});

test('normalizeJourney requires a non-empty steps array with single-action steps', () => {
  const valid = normalizeJourney({
    journey: 'checkout-timeout',
    steps: [
      { switch: { rule: 'checkout', scenario: 'timeout' } },
      { wait: { rule: 'checkout', timeout: 10000 } },
    ],
  });
  assert.equal(valid.name, 'checkout-timeout');
  assert.equal(valid.steps.length, 2);

  for (const bad of [
    null,
    [],
    { journey: 'x' },
    { steps: [] },
    { steps: ['switch'] },
    { steps: [{ unknown: {} }] },
    { steps: [{ switch: { rule: 'a', scenario: 'b' }, wait: {} }] },
  ]) {
    assert.throws(() => normalizeJourney(bad), (error) => error.code === 'invalid_journey');
  }
});

test('waitForHit resolves on a matching hit and ignores non-matching ones', async () => {
  const daemon = await startDaemon({ port: 0 });
  const port = daemon.address.port;
  const extension = await openSocket(`ws://127.0.0.1:${port}/ws`, 'chrome-extension://abcdefghijklmnop');
  extension.send(JSON.stringify({ kind: 'hello', role: 'extension' }));
  await new Promise((resolve) => setTimeout(resolve, 25));

  const pending = waitForHit({ ruleId: 'user-list', scenarioId: 'ok', timeout: 5000 }, port);
  await new Promise((resolve) => setTimeout(resolve, 25));
  extension.send(JSON.stringify({
    kind: 'event', event: 'hit',
    hit: { id: 'h1', ruleId: 'other-rule', scenarioId: 'ok', url: 'https://example.test/x', method: 'GET', status: 200, timestamp: '2026-09-02T00:00:00.000Z' },
  }));
  extension.send(JSON.stringify({
    kind: 'event', event: 'hit',
    hit: { id: 'h2', ruleId: 'user-list', scenarioId: 'empty', url: 'https://example.test/api/users', method: 'GET', status: 200, timestamp: '2026-09-02T00:00:01.000Z' },
  }));
  extension.send(JSON.stringify({
    kind: 'event', event: 'hit',
    hit: { id: 'h3', ruleId: 'user-list', scenarioId: 'ok', url: 'https://example.test/api/users', method: 'GET', status: 200, timestamp: '2026-09-02T00:00:02.000Z' },
  }));
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.data.hit.id, 'h3');

  extension.close();
  await daemon.close();
});

test('waitForHit fails fast when the extension is not connected', async () => {
  const daemon = await startDaemon({ port: 0 });
  const result = await waitForHit({ timeout: 5000 }, daemon.address.port);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'extension_not_connected');
  await daemon.close();
});

test('waitForHit times out with a stable error code', async () => {
  const daemon = await startDaemon({ port: 0 });
  const extension = await openSocket(`ws://127.0.0.1:${daemon.address.port}/ws`, 'chrome-extension://abcdefghijklmnop');
  extension.send(JSON.stringify({ kind: 'hello', role: 'extension' }));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const result = await waitForHit({ ruleId: 'never-hit', timeout: 120 }, daemon.address.port);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'wait_timeout');
  extension.close();
  await daemon.close();
});

test('waitForHit reports extension disconnect mid-wait', async () => {
  const daemon = await startDaemon({ port: 0 });
  const extension = await openSocket(`ws://127.0.0.1:${daemon.address.port}/ws`, 'chrome-extension://abcdefghijklmnop');
  extension.send(JSON.stringify({ kind: 'hello', role: 'extension' }));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const pending = waitForHit({ ruleId: 'user-list', timeout: 5000 }, daemon.address.port);
  await new Promise((resolve) => setTimeout(resolve, 50));
  extension.close();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'extension_disconnected');
  await daemon.close();
});
