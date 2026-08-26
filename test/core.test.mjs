import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRule } from '../src/core/schema.mjs';
import { findMatchingRule, matchesRule } from '../src/core/matcher.mjs';
import { applyStateCommand, createState, recordHit } from '../src/core/state.mjs';
import { installFetchInterceptor, installXHRInterceptor } from '../src/core/interceptor.mjs';
import { executeStoredCommand } from '../src/core/command-runner.mjs';
import { createWebSocketKeepalive, KEEPALIVE_INTERVAL_MS } from '../src/extension/keepalive.mjs';
import { executeBrowserRequest } from '../src/core/browser-request.mjs';
import { DEFAULT_REQUEST_TIMEOUT_MS, MAX_RESPONSE_BODY_BYTES, normalizeBrowserRequest, targetTabFailure } from '../src/core/request.mjs';
import { commandFromArgs } from '../bin/mocklane.js';

test('normalizes rule defaults and preserves an empty raw body', () => {
  const rule = normalizeRule({ id: 'empty', endpoint: '/empty' }, { now: '2025-01-01T00:00:00.000Z' });
  assert.equal(rule.matchType, 'contains');
  assert.equal(rule.method, 'GET');
  assert.equal(rule.enabled, true);
  assert.equal(rule.activeScenarioId, 'default');
  assert.equal(rule.scenarios[0].body, '');
  assert.equal(normalizeRule({ endpoint: '/bad-status', status: 199 }).scenarios[0].status, 200);
  assert.equal(rule.createdAt, '2025-01-01T00:00:00.000Z');
});

test('matches contains and regex rules with method normalization', () => {
  const contains = normalizeRule({ id: 'contains', endpoint: '/api/users', method: 'get' });
  const regex = normalizeRule({ id: 'regex', endpoint: '^https://example\\.test/items/\\d+$', matchType: 'regex', method: 'POST' });
  assert.equal(matchesRule(contains, { url: 'https://example.test/api/users?x=1', method: 'GET' }), true);
  assert.equal(matchesRule(contains, { url: 'https://example.test/api/users', method: 'POST' }), false);
  assert.equal(matchesRule(regex, { url: 'https://example.test/items/42', method: 'post' }), true);
  assert.equal(findMatchingRule([regex, contains], { url: 'https://example.test/api/users', method: 'GET' }, { globalEnabled: false }), null);
});

test('switches one active scenario and records bounded hit data', () => {
  let state = createState();
  state = applyStateCommand(state, { name: 'apply', payload: { rule: {
    id: 'orders', endpoint: '/orders', scenarios: [
      { id: 'ok', name: 'OK', body: '{}' },
      { id: 'error', name: 'Error', status: 500, body: '{"error":true}' },
    ],
  } } }).state;
  const switched = applyStateCommand(state, { name: 'switch', payload: { ruleId: 'orders', scenarioId: 'error' } });
  assert.equal(switched.ok, true);
  assert.equal(switched.state.rules[0].activeScenarioId, 'error');
  const recorded = recordHit(switched.state, { ruleId: 'orders', endpoint: '/orders', url: '/orders', scenarioId: 'error', status: 500 });
  assert.equal(recorded.state.logs.length, 1);
  assert.equal(recorded.hit.status, 500);
});

test('read-only commands do not write storage or broadcast state', async () => {
  const state = {
    globalEnabled: false,
    rules: [normalizeRule({ id: 'query-only', endpoint: '/query' })],
    logs: [],
  };
  let writes = 0;
  let broadcasts = 0;
  const adapter = {
    readState: async () => state,
    writeState: async () => { writes += 1; },
    onState: async () => { broadcasts += 1; },
  };
  for (const command of [
    { name: 'status' },
    { name: 'list' },
    { name: 'scenarios', payload: { ruleId: 'query-only' } },
    { name: 'logs', payload: { limit: 10 } },
    { name: 'match', payload: { url: '/query', method: 'GET' } },
  ]) {
    const result = await executeStoredCommand(command, adapter);
    assert.equal(result.ok, true);
  }
  assert.equal(writes, 0);
  assert.equal(broadcasts, 0);
});

test('WebSocket keepalive uses one sub-30-second interval and cleans it on stop', () => {
  assert.ok(KEEPALIVE_INTERVAL_MS < 30_000);
  const socket = { readyState: 1, sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
  const scheduled = [];
  const cleared = [];
  const keepalive = createWebSocketKeepalive({
    getSocket: () => socket,
    setIntervalFn(callback, delay) {
      const timer = { callback, delay };
      scheduled.push(timer);
      return timer;
    },
    clearIntervalFn(timer) { cleared.push(timer); },
  });
  assert.equal(keepalive.start(), true);
  assert.equal(keepalive.start(), false);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, KEEPALIVE_INTERVAL_MS);
  scheduled[0].callback();
  assert.deepEqual(socket.sent, [{ kind: 'keepalive' }]);
  assert.equal(keepalive.active, true);
  assert.equal(keepalive.stop(), true);
  assert.equal(keepalive.stop(), false);
  assert.deepEqual(cleared, [scheduled[0]]);
  assert.equal(keepalive.active, false);
});

test('fetch interception uses Request.method and returns status, headers, and raw body', async () => {
  let nativeCalls = 0;
  const state = {
    globalEnabled: true,
    rules: [normalizeRule({ id: 'fetch', endpoint: '/resource', method: 'POST', scenarios: [{ id: 'raw', status: 201, headers: { 'x-mock': 'yes' }, body: '' }] })],
  };
  const target = {
    Response,
    fetch() { nativeCalls += 1; return Promise.resolve(new Response('native')); },
  };
  const hits = [];
  const restore = installFetchInterceptor(target, () => state, (hit) => hits.push(hit));
  const response = await target.fetch(new Request('https://example.test/resource', { method: 'POST' }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-mock'), 'yes');
  assert.equal(await response.text(), '');
  assert.equal(hits[0].scenarioId, 'raw');
  assert.equal(nativeCalls, 0);
  state.globalEnabled = false;
  await target.fetch('https://example.test/resource');
  assert.equal(nativeCalls, 1);
  restore();
});

test('XHR interception keeps async load flow and exposes response properties', async () => {
  let nativeCalls = 0;
  class FakeXHR extends EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      this.responseType = '';
      this.response = null;
      this.responseText = '';
      this.status = 0;
    }
    open(method, url) { this.nativeOpen = { method, url }; }
    send() { nativeCalls += 1; }
    getResponseHeader() { return null; }
    getAllResponseHeaders() { return ''; }
    dispatchEvent(event) {
      const result = super.dispatchEvent(event);
      this[`on${event.type}`]?.(event);
      return result;
    }
  }
  const state = {
    globalEnabled: true,
    rules: [normalizeRule({ id: 'xhr', endpoint: '/xhr', method: 'GET', scenarios: [{ id: 'ok', status: 202, headers: { 'x-mock': 'yes' }, body: 'hello' }] })],
  };
  const target = { XMLHttpRequest: FakeXHR };
  const hits = [];
  const restore = installXHRInterceptor(target, () => state, (hit) => hits.push(hit));
  const xhr = new FakeXHR();
  let loaded = false;
  xhr.onload = () => { loaded = true; };
  xhr.open('GET', 'https://example.test/xhr');
  xhr.send();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(nativeCalls, 0);
  assert.equal(loaded, true);
  assert.equal(xhr.status, 202);
  assert.equal(xhr.responseText, 'hello');
  assert.equal(xhr.getResponseHeader('X-Mock'), 'yes');
  assert.equal(hits.length, 1);
  restore();
});

test('normalizes browser request defaults and CLI arguments into one contract', async () => {
  const normalized = normalizeBrowserRequest({ url: '/api', headers: { 'X-Trace': 42 } });
  assert.equal(normalized.method, 'GET');
  assert.equal(normalized.timeout, DEFAULT_REQUEST_TIMEOUT_MS);
  assert.deepEqual(normalized.headers, { 'x-trace': '42' });
  assert.equal(normalized.native, false);

  const command = await commandFromArgs('request', [
    '--url', 'https://example.test/api', '--method', 'post',
    '--headers', '{"content-type":"application/json"}', '--body', '{}',
    '--timeout', '2500', '--native', '--tab-id', '17',
  ]);
  assert.deepEqual(command, {
    name: 'request',
    payload: {
      url: 'https://example.test/api',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      timeout: 2500,
      native: true,
      tabId: 17,
    },
  });
  assert.throws(() => commandFromArgs('request', ['--url', 'https://example.test', '--headers', '{']), { code: 'invalid_headers' });
  assert.throws(() => commandFromArgs('request', ['--url', 'https://example.test', '--timeout', '0']), { code: 'invalid_timeout' });
  assert.equal(targetTabFailure({ id: 1, url: 'https://app.example.test/home' }), null);
  assert.equal(targetTabFailure({ id: 2, url: 'chrome://settings' })?.code, 'unsupported_tab');
  assert.equal(targetTabFailure({ id: 3, url: 'http://127.0.0.1:17321/' })?.code, 'dashboard_tab_forbidden');
});

test('browser request executor follows mock and native fetch paths', async () => {
  const state = {
    globalEnabled: true,
    rules: [normalizeRule({ id: 'request', endpoint: '/request', method: 'POST', scenarios: [{ id: 'mocked', status: 207, headers: { 'x-mock': 'yes' }, body: '{"mock":true}' }] })],
  };
  const target = {
    Response,
    fetch() { return Promise.resolve(new Response('{"native":true}', { status: 200, headers: { 'x-native': 'yes' } })); },
  };
  const nativeFetch = target.fetch;
  const restore = installFetchInterceptor(target, () => state, () => {});
  const mocked = await executeBrowserRequest({ url: 'https://example.test/request', method: 'POST', body: '{}' }, {
    fetchImpl: target.fetch,
    nativeFetch,
    fetchThis: target,
  });
  assert.equal(mocked.ok, true);
  assert.equal(mocked.data.status, 207);
  assert.equal(mocked.data.headers['x-mock'], 'yes');
  assert.equal(mocked.data.body, '{"mock":true}');

  const native = await executeBrowserRequest({ url: 'https://example.test/request', method: 'POST', body: '{}', native: true }, {
    fetchImpl: target.fetch,
    nativeFetch,
    fetchThis: target,
  });
  assert.equal(native.ok, true);
  assert.equal(native.data.status, 200);
  assert.equal(native.data.headers['x-native'], 'yes');
  assert.equal(native.data.body, '{"native":true}');
  restore();
});

test('browser request executor returns stable timeout, network, and size errors', async () => {
  const timeout = await executeBrowserRequest({ url: 'https://example.test/slow', timeout: 5 }, {
    fetchImpl: () => new Promise(() => {}),
  });
  assert.deepEqual(timeout.error?.code, 'request_timeout');

  const network = await executeBrowserRequest({ url: 'https://example.test/offline' }, {
    fetchImpl: () => Promise.reject(new TypeError('failed to fetch')),
  });
  assert.equal(network.error?.code, 'network_error');

  const tooLarge = await executeBrowserRequest({ url: 'https://example.test/large' }, {
    fetchImpl: () => Promise.resolve({
      status: 200,
      headers: {},
      text: async () => 'x'.repeat(MAX_RESPONSE_BODY_BYTES + 1),
    }),
  });
  assert.equal(tooLarge.error?.code, 'response_too_large');
});
