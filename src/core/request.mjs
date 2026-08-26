/**
 * The small, JSON-safe request contract shared by the CLI, service worker,
 * and MAIN-world request bridge.
 */

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
export const MAX_REQUEST_TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;

const HTTP_METHOD = /^[A-Z][A-Z0-9$_.-]*$/;

export function requestError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function normalizeRequestHeaders(input) {
  const source = typeof Headers !== 'undefined' && input instanceof Headers
    ? Object.fromEntries(input.entries())
    : record(input);
  if (!source) throw requestError('invalid_headers', 'headers must be a JSON object');
  const headers = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = String(key).trim().toLowerCase();
    if (!normalizedKey) throw requestError('invalid_headers', 'header names must not be empty');
    headers[normalizedKey] = value == null ? '' : String(value);
  }
  return headers;
}

function normalizeUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) throw requestError('missing_url', 'request url is required');
  let parsed;
  try { parsed = new URL(url); } catch {
    // A path is resolved against the selected page by window.fetch. Do not
    // accept protocol-relative or arbitrary scheme-like values here.
    if (/^\/(?!\/)/.test(url)) return url;
    throw requestError('invalid_url', 'request url must be an http(s) URL or an absolute page path');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw requestError('invalid_url', 'request url must use http or https');
  }
  return url;
}

export function normalizeBrowserRequest(input = {}) {
  const source = record(input);
  if (!source) throw requestError('invalid_request', 'request must be a JSON object');
  const url = normalizeUrl(source.url);
  const method = String(source.method || 'GET').trim().toUpperCase() || 'GET';
  if (!HTTP_METHOD.test(method)) throw requestError('invalid_method', `invalid HTTP method: ${method}`);
  const headers = normalizeRequestHeaders(source.headers === undefined ? {} : source.headers);
  const hasBody = Object.prototype.hasOwnProperty.call(source, 'body') && source.body !== undefined && source.body !== null;
  const body = hasBody ? String(source.body) : undefined;
  if (hasBody && (method === 'GET' || method === 'HEAD')) {
    throw requestError('body_not_allowed', `${method} requests cannot include a body`);
  }

  const rawTimeout = source.timeout === undefined || source.timeout === null || source.timeout === ''
    ? DEFAULT_REQUEST_TIMEOUT_MS
    : Number(source.timeout);
  if (!Number.isInteger(rawTimeout) || rawTimeout < 1 || rawTimeout > MAX_REQUEST_TIMEOUT_MS) {
    throw requestError('invalid_timeout', `timeout must be an integer between 1 and ${MAX_REQUEST_TIMEOUT_MS}ms`);
  }

  let tabId;
  if (source.tabId !== undefined && source.tabId !== null && source.tabId !== '') {
    tabId = Number(source.tabId);
    if (!Number.isInteger(tabId) || tabId < 0) throw requestError('invalid_tab_id', 'tab-id must be a non-negative integer');
  }

  return {
    url,
    method,
    headers,
    ...(hasBody ? { body } : {}),
    timeout: rawTimeout,
    native: source.native === true,
    ...(tabId === undefined ? {} : { tabId }),
  };
}

export function targetTabFailure(tab, dashboardPort = 17321) {
  const tabUrl = String(tab?.url || '');
  if (!tabUrl) return { code: 'tab_url_unavailable', message: 'target tab URL is unavailable' };
  let parsed;
  try { parsed = new URL(tabUrl); } catch { return { code: 'unsupported_tab', message: 'target tab is not a web page' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { code: 'unsupported_tab', message: 'target tab must be an http or https page' };
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  if (loopback && port === dashboardPort) {
    return { code: 'dashboard_tab_forbidden', message: 'the Mocklane dashboard cannot be a request target' };
  }
  return null;
}
