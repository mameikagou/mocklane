import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../core/request.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 17321;
const MAX_HTTP_BODY = 1024 * 1024;
const MAX_WEBSOCKET_PAYLOAD = 4 * 1024 * 1024;

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function jsonHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  };
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, jsonHeaders());
  response.end(JSON.stringify(value));
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_HTTP_BODY) {
        reject(Object.assign(new Error('request body too large'), { code: 'body_too_large' }));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); } catch {
        reject(Object.assign(new Error('request body must be valid JSON'), { code: 'invalid_json' }));
      }
    });
    request.on('error', reject);
  });
}

function safeStaticPath(staticDir, requestPath) {
  const pathname = decodeURIComponent(requestPath.split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = path.resolve(staticDir);
  const candidate = path.resolve(root, relative);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function mimeFor(filePath) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }[path.extname(filePath)] || 'application/octet-stream';
}

export function isAllowedWebSocketOrigin(origin = '') {
  // Non-browser clients (the extension's WebSocket and Node smoke tests) may
  // omit Origin. HTTP CLI requests do not pass through this check.
  if (!origin) return true;
  if (origin.startsWith('chrome-extension://')) {
    try { return new URL(origin).protocol === 'chrome-extension:'; } catch { return false; }
  }
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, status = 403, message = 'Forbidden') {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function commandResultError(code, message) {
  return { ok: false, error: { code, message } };
}

export function relayTimeoutForCommand(command, fallback = 5000) {
  const commandName = String(command?.name || command?.command || '').toLowerCase();
  const requestTimeout = Number(command?.payload?.timeout ?? command?.timeout);
  if (commandName !== 'request') return fallback;
  const timeout = Number.isInteger(requestTimeout) && requestTimeout > 0
    ? requestTimeout
    : DEFAULT_REQUEST_TIMEOUT_MS;
  return timeout + 1000;
}

/**
 * Create the relay daemon. It owns sockets and pending request promises only;
 * no rule, scenario, or hit data is retained here.
 */
export function createDaemonServer(options = {}) {
  const projectRoot = options.projectRoot || path.resolve(HERE, '../..');
  const builtDashboard = path.join(projectRoot, 'dist/dashboard');
  // Resolve this lazily for every request. The daemon is often started before
  // `npm run build`; pinning the missing source directory at startup made the
  // extension action keep returning 404 even after the dashboard was built.
  const dashboardStaticDir = () => {
    if (options.staticDir) return options.staticDir;
    return fs.existsSync(path.join(builtDashboard, 'index.html')) ? builtDashboard : null;
  };
  const clients = new Set();
  const pending = new Map();
  let requestCounter = 0;
  // A request response may contain the full bounded page body (2 MiB) plus
  // the JSON envelope, so the relay limit must be larger than the HTTP RPC
  // input limit without becoming an unbounded message sink.
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_WEBSOCKET_PAYLOAD });

  function extensionClient() {
    return [...clients].find((client) => client.role === 'extension' && client.socket.readyState === WebSocket.OPEN) || null;
  }

  function dashboardClients() {
    return [...clients].filter((client) => client.role === 'dashboard' && client.socket.readyState === WebSocket.OPEN);
  }

  function sendSocket(client, value) {
    if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(value));
  }

  function broadcast(value) {
    for (const client of dashboardClients()) sendSocket(client, value);
  }

  function callExtension(command) {
    const client = extensionClient();
    if (!client) return Promise.resolve(commandResultError('extension_not_connected', 'Mocklane extension is not connected'));
    const requestId = `daemon_${Date.now().toString(36)}_${requestCounter++}`;
    const relayTimeout = relayTimeoutForCommand(command, options.rpcTimeout || 5000);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve(commandResultError('extension_timeout', 'Mocklane extension did not respond in time'));
      }, relayTimeout);
      pending.set(requestId, { resolve, timer });
      sendSocket(client, { kind: 'rpc', requestId, command });
    });
  }

  function onMessage(client, data) {
    let message;
    try { message = JSON.parse(String(data)); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (message.kind === 'hello') {
      client.role = String(message.role || 'unknown');
      sendSocket(client, { kind: 'hello', role: 'daemon', extensionConnected: Boolean(extensionClient()) });
      broadcast({ kind: 'event', event: 'connections', extensionConnected: Boolean(extensionClient()) });
      return;
    }
    if (client.role === 'extension' && message.kind === 'rpc-result') {
      const entry = pending.get(message.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.requestId);
      entry.resolve(message.result || commandResultError('empty_result', 'Extension returned no result'));
      return;
    }
    if (client.role === 'extension' && message.kind === 'event') {
      // Events are relayed transiently; the extension owns their persistence.
      broadcast({ kind: 'event', event: message.event, hit: message.hit, state: message.state });
      return;
    }
    if (client.role === 'dashboard' && message.kind === 'rpc') {
      callExtension(message.command).then((result) => {
        sendSocket(client, { kind: 'rpc-result', requestId: message.requestId, result });
      });
    }
  }

  function onSocketClose(client) {
    if (client.closed) return;
    client.closed = true;
    clients.delete(client);
    if (client.role === 'extension') {
      for (const [requestId, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve(commandResultError('extension_disconnected', 'Mocklane extension disconnected'));
        pending.delete(requestId);
      }
    }
    broadcast({ kind: 'event', event: 'connections', extensionConnected: Boolean(extensionClient()) });
  }

  webSocketServer.on('connection', (socket) => {
    const client = { socket, role: 'unknown', closed: false };
    clients.add(client);
    socket.on('message', (data) => onMessage(client, data));
    socket.on('error', () => onSocketClose(client));
    socket.on('close', () => onSocketClose(client));
  });

  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, jsonHeaders());
      response.end();
      return;
    }
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    if (requestUrl.pathname === '/health') {
      sendJson(response, 200, { ok: true, port: server.address()?.port || options.port || DEFAULT_PORT, extensionConnected: Boolean(extensionClient()) });
      return;
    }
    if (requestUrl.pathname === '/rpc' && request.method === 'POST') {
      try {
        const body = await parseRequestBody(request);
        const result = await callExtension(body.command || body);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, commandResultError(error.code || 'invalid_request', error.message || String(error)));
      }
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const staticDir = dashboardStaticDir();
      let filePath;
      try { filePath = staticDir ? safeStaticPath(staticDir, requestUrl.pathname) : null; } catch { filePath = null; }
      if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        response.writeHead(200, { 'content-type': mimeFor(filePath), 'cache-control': 'no-store' });
        if (request.method === 'HEAD') response.end();
        else fs.createReadStream(filePath).pipe(response);
        return;
      }
    }
    sendJson(response, 404, { ok: false, error: { code: 'not_found', message: 'not found' } });
  });

  server.on('upgrade', (request, socket, head) => {
    let requestUrl;
    try { requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`); } catch { rejectUpgrade(socket, 400, 'Bad Request'); return; }
    if (requestUrl.pathname !== '/ws') { rejectUpgrade(socket, 404, 'Not Found'); return; }
    if (!isAllowedWebSocketOrigin(request.headers.origin || '')) { rejectUpgrade(socket); return; }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request);
    });
  });

  return {
    server,
    clients,
    async listen(port = DEFAULT_PORT, host = '127.0.0.1') {
      await new Promise((resolve, reject) => {
        const onError = (error) => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      return server.address();
    },
    async close() {
      for (const client of clients) client.socket.close();
      await new Promise((resolve) => webSocketServer.close(() => resolve()));
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

export async function startDaemon(options = {}) {
  const daemon = createDaemonServer(options);
  const host = options.host || '127.0.0.1';
  if (!isLoopbackHost(host)) throw new Error('daemon host must be loopback (127.0.0.1, localhost, or ::1)');
  const address = await daemon.listen(options.port ?? DEFAULT_PORT, host);
  return { ...daemon, address };
}
