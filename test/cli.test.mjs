import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { normalizeJourney, parseWaitTimeout, resolveEnvScope, summarizeByEnv, waitForHit } from '../bin/mocklane.js';
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

test('waitForHit page filter only resolves hits from the right environment', async () => {
  const daemon = await startDaemon({ port: 0 });
  const port = daemon.address.port;
  const extension = await openSocket(`ws://127.0.0.1:${port}/ws`, 'chrome-extension://abcdefghijklmnop');
  extension.send(JSON.stringify({ kind: 'hello', role: 'extension' }));
  await new Promise((resolve) => setTimeout(resolve, 25));

  const pending = waitForHit({ ruleId: 'user-list', page: '//qnh.shangou.test.', timeout: 5000 }, port);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const send = (pageUrl) => extension.send(JSON.stringify({
    kind: 'event', event: 'hit',
    hit: { id: `h-${pageUrl.length}`, ruleId: 'user-list', scenarioId: 'ok', url: 'https://x.test/api', method: 'GET', status: 200, pageUrl, timestamp: '2026-09-02T00:00:00.000Z' },
  }));
  send('https://qnh.meituan.com/home.html'); // production — must be ignored
  send('https://selftest-260821-104730-989-sl-qnh.shangou.test.meituan.com/home.html'); // swimlane — must be ignored
  send('https://qnh.shangou.test.meituan.com/home.html'); // test env — resolves
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.data.hit.pageUrl, 'https://qnh.shangou.test.meituan.com/home.html');
  extension.close();
  await daemon.close();
});

test('resolveEnvScope maps named envs to page patterns', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mocklane-envs-'));
  const envsFile = path.join(dir, 'envs.json');
  await fs.writeFile(envsFile, JSON.stringify({
    swimlane: { page: '//selftest-260821-104730-989-sl-qnh.' },
    st: { page: '//qnh.shangou.st.', matchType: 'contains' },
  }));
  try {
    const resolved = await resolveEnvScope({ id: 'r1', endpoint: '/api', env: 'swimlane' }, envsFile);
    assert.equal(resolved.page, '//selftest-260821-104730-989-sl-qnh.');
    assert.equal(resolved.env, undefined, 'env key is consumed at apply time');
    const untouched = await resolveEnvScope({ id: 'r2', endpoint: '/api' }, envsFile);
    assert.equal(untouched.page, undefined, 'rules without env pass through');
    await assert.rejects(
      () => resolveEnvScope({ id: 'r3', endpoint: '/api', env: 'nope' }, envsFile),
      (error) => error.code === 'unknown_env' && /swimlane/.test(error.message),
    );
    await assert.rejects(
      () => resolveEnvScope({ id: 'r4', endpoint: '/api', env: 'st', page: '//x' }, envsFile),
      (error) => error.code === 'ambiguous_page_scope',
    );
    await assert.rejects(
      () => resolveEnvScope({ id: 'r5', endpoint: '/api', env: 'st' }, path.join(dir, 'missing.json')),
      (error) => error.code === 'missing_envs_file',
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('summarizeByEnv groups hits by page host for environment comparison', () => {
  const envs = summarizeByEnv([
    { pageUrl: 'https://qnh.shangou.test.meituan.com/home.html#/a' },
    { pageUrl: 'https://qnh.shangou.test.meituan.com/home.html#/b' },
    { pageUrl: 'https://selftest-260821-104730-989-sl-qnh.shangou.test.meituan.com/home.html' },
    { pageUrl: '' },
  ]);
  assert.deepEqual(envs, [
    { host: 'qnh.shangou.test.meituan.com', hits: 2 },
    { host: 'selftest-260821-104730-989-sl-qnh.shangou.test.meituan.com', hits: 1 },
    { host: '(unknown page)', hits: 1 },
  ]);
  assert.deepEqual(summarizeByEnv(undefined), []);
});
