import {
  MAX_RESPONSE_BODY_BYTES,
  normalizeBrowserRequest,
  requestError,
} from './request.mjs';

function resultError(code, message) {
  return { ok: false, error: { code, message } };
}

function byteLength(value) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).byteLength;
  return String(value).length;
}

async function readBody(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (byteLength(text) > maxBytes) throw requestError('response_too_large', `response body exceeds ${maxBytes} bytes`);
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const value = next.value instanceof Uint8Array
        ? next.value
        : typeof next.value === 'string'
          ? new TextEncoder().encode(next.value)
          : new Uint8Array(next.value || []);
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw requestError('response_too_large', `response body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function responseHeaders(response) {
  if (response.headers?.entries) return Object.fromEntries(response.headers.entries());
  if (response.headers?.forEach) {
    const headers = {};
    response.headers.forEach((value, key) => { headers[String(key).toLowerCase()] = String(value); });
    return headers;
  }
  return {};
}

function fetchInit(request, signal) {
  const init = { method: request.method, headers: request.headers, signal };
  if (Object.prototype.hasOwnProperty.call(request, 'body')) init.body = request.body;
  return init;
}

function errorResult(error, timedOut) {
  if (timedOut || error?.name === 'AbortError') return resultError('request_timeout', 'browser request timed out');
  if (error?.code) return resultError(error.code, error.message || error.code);
  if (error?.name === 'TypeError') return resultError('network_error', 'network or CORS request failed');
  return resultError('request_error', error?.message || String(error));
}

/**
 * Execute a request using either the intercepted page fetch or the original
 * fetch saved before installation. Keeping this outside the entry file makes
 * the production behavior directly testable without a real browser.
 */
export async function executeBrowserRequest(input, options = {}) {
  let request;
  try { request = normalizeBrowserRequest(input); } catch (error) { return errorResult(error, false); }
  const fetchImpl = request.native ? options.nativeFetch : options.fetchImpl;
  if (typeof fetchImpl !== 'function') {
    return resultError(request.native ? 'native_fetch_unavailable' : 'fetch_unavailable', 'page fetch is unavailable');
  }

  const AbortControllerConstructor = options.AbortControllerConstructor || globalThis.AbortController;
  const controller = typeof AbortControllerConstructor === 'function' ? new AbortControllerConstructor() : null;
  let timedOut = false;
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller?.abort();
      reject(requestError('request_timeout', 'browser request timed out'));
    }, request.timeout);
  });

  try {
    const operation = Promise.resolve().then(() => fetchImpl.call(options.fetchThis || globalThis, request.url, fetchInit(request, controller?.signal)));
    const response = await Promise.race([operation, timeoutPromise]);
    const status = Number(response?.status);
    if (!Number.isInteger(status) || status < 200 || status > 599) {
      throw requestError('invalid_response', 'browser returned an invalid response status');
    }
    const body = await Promise.race([readBody(response, MAX_RESPONSE_BODY_BYTES), timeoutPromise]);
    return {
      ok: true,
      data: {
        url: request.url,
        status,
        headers: responseHeaders(response),
        body,
      },
    };
  } catch (error) {
    return errorResult(error, timedOut);
  } finally {
    clearTimeout(timeoutId);
  }
}

export { fetchInit, readBody };
