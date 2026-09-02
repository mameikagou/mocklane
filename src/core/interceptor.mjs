import { findMatchingRule } from './matcher.mjs';
import { normalizeStatus } from './schema.mjs';

function requestFromFetch(input, init = undefined) {
  let url = '';
  let method = 'GET';
  if (typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL)) {
    url = String(input);
  } else if (input && typeof input === 'object') {
    url = String(input.url || '');
    method = String(input.method || 'GET');
  } else {
    url = String(input ?? '');
  }
  if (init && init.method != null) method = String(init.method);
  return { url, method: method.toUpperCase() };
}

export function createMockResponse(scenario, ResponseConstructor = globalThis.Response) {
  const status = normalizeStatus(scenario?.status, 200);
  const body = scenario?.body == null ? '' : String(scenario.body);
  const safeBody = [204, 205, 304].includes(status) ? null : body;
  return new ResponseConstructor(safeBody, { status, headers: scenario?.headers || {} });
}

function pageUrlOf(target) {
  try { return String(target?.location?.href || ''); } catch { return ''; }
}

export function createFetchInterceptor({ originalFetch, getState, onHit, getPageUrl = () => '', ResponseConstructor = globalThis.Response }) {
  if (typeof originalFetch !== 'function') throw new TypeError('originalFetch must be a function');
  return function mocklaneFetch(input, init) {
    const pageUrl = String(getPageUrl() || '');
    const request = { ...requestFromFetch(input, init), pageUrl };
    const state = getState() || {};
    const matched = findMatchingRule(state.rules, request, { globalEnabled: state.globalEnabled });
    if (!matched) return originalFetch.call(this, input, init);
    const hit = {
      ruleId: matched.rule.id,
      endpoint: matched.rule.endpoint,
      url: request.url,
      method: request.method,
      scenarioId: matched.scenario.id,
      status: matched.scenario.status,
      pageUrl,
    };
    onHit?.(hit);
    return Promise.resolve(createMockResponse(matched.scenario, ResponseConstructor));
  };
}

export function installFetchInterceptor(target, getState, onHit) {
  if (!target || typeof target.fetch !== 'function') return () => {};
  const original = target.fetch;
  const wrapped = createFetchInterceptor({
    originalFetch: original,
    getState,
    onHit,
    getPageUrl: () => pageUrlOf(target),
    ResponseConstructor: target.Response || globalThis.Response,
  });
  target.fetch = wrapped;
  return () => { target.fetch = original; };
}

function defineValue(target, key, value) {
  try {
    Object.defineProperty(target, key, { configurable: true, enumerable: true, get: () => value });
    return true;
  } catch {
    try { target[key] = value; return true; } catch { return false; }
  }
}

function xhrHeaders(scenario) {
  const entries = Object.entries(scenario?.headers || {});
  return entries.map(([key, value]) => `${key}: ${value}`).join('\r\n') + (entries.length ? '\r\n' : '');
}

export function installXHRInterceptor(target, getState, onHit) {
  const XHR = target?.XMLHttpRequest;
  if (!XHR?.prototype) return () => {};
  const proto = XHR.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;
  const originalGetResponseHeader = proto.getResponseHeader;
  const originalGetAllResponseHeaders = proto.getAllResponseHeaders;

  proto.open = function mocklaneOpen(method, url, ...rest) {
    this.__mocklaneRequest = { method: String(method || 'GET').toUpperCase(), url: String(url || '') };
    return originalOpen.call(this, method, url, ...rest);
  };

  proto.send = function mocklaneSend(body) {
    const pageUrl = pageUrlOf(target);
    const request = { ...(this.__mocklaneRequest || { method: 'GET', url: '' }), pageUrl };
    const state = getState() || {};
    const matched = findMatchingRule(state.rules, request, { globalEnabled: state.globalEnabled });
    if (!matched) return originalSend.call(this, body);
    const xhr = this;
    const scenario = matched.scenario;
    const rawBody = scenario.body == null ? '' : String(scenario.body);
    const status = normalizeStatus(scenario.status, 200);
    const responseBody = [204, 205, 304].includes(status) ? '' : rawBody;
    const headerText = xhrHeaders(scenario);
    onHit?.({
      ruleId: matched.rule.id,
      endpoint: matched.rule.endpoint,
      url: request.url,
      method: request.method,
      scenarioId: scenario.id,
      status,
      pageUrl,
    });

    const respond = () => {
      const responseType = xhr.responseType || '';
      let response = responseBody;
      if (responseType === 'json') {
        try { response = responseBody === '' ? null : JSON.parse(responseBody); } catch { response = null; }
      }
      defineValue(xhr, 'readyState', 4);
      defineValue(xhr, 'status', status);
      defineValue(xhr, 'statusText', '');
      defineValue(xhr, 'responseURL', request.url);
      defineValue(xhr, 'response', response);
      if (!responseType || responseType === 'text') defineValue(xhr, 'responseText', responseBody);
      xhr.getResponseHeader = (name) => {
        const key = String(name || '').toLowerCase();
        const found = Object.entries(scenario.headers || {}).find(([header]) => header.toLowerCase() === key);
        return found ? String(found[1]) : null;
      };
      xhr.getAllResponseHeaders = () => headerText;
      if (typeof xhr.dispatchEvent === 'function' && typeof Event === 'function') {
        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new Event('load'));
        xhr.dispatchEvent(new Event('loadend'));
      } else {
        xhr.onreadystatechange?.();
        xhr.onload?.();
        xhr.onloadend?.();
      }
    };
    setTimeout(respond, 0);
    return undefined;
  };

  return () => {
    proto.open = originalOpen;
    proto.send = originalSend;
    if (originalGetResponseHeader) proto.getResponseHeader = originalGetResponseHeader;
    if (originalGetAllResponseHeaders) proto.getAllResponseHeaders = originalGetAllResponseHeaders;
  };
}

export function installInterceptors(target, getState, onHit) {
  const restoreFetch = installFetchInterceptor(target, getState, onHit);
  const restoreXhr = installXHRInterceptor(target, getState, onHit);
  return () => { restoreFetch(); restoreXhr(); };
}

export { requestFromFetch };
