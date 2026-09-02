#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { startDaemon } from '../src/daemon/server.mjs';
import { normalizeBrowserRequest } from '../src/core/request.mjs';

const DEFAULT_PORT = 17321;

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function help() {
  print({
    ok: true,
    data: {
      usage: 'mocklane <command> [arguments]',
      commands: {
        daemon: 'daemon [--background] [--port 17321] [--host 127.0.0.1]',
        status: 'status',
        list: 'list',
        apply: 'apply --json <rule-json> | apply <rule-json> [--file path] (supports bodyFile in rule/scenarios)',
        scenarios: 'scenarios <rule-id>',
        switch: 'switch <rule-id> <scenario-id>',
        enable: 'enable <rule-id>',
        disable: 'disable <rule-id>',
        remove: 'remove <rule-id>',
        global: 'global on|off',
        logs: 'logs [--limit N]',
        match: 'match --url <url> [--method GET]',
        request: 'request --url <url> [--method GET] [--headers JSON] [--body text] [--timeout ms] [--native] [--tab-id ID]',
      },
    },
  });
}

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

function flag(args, name) {
  return args.includes(name);
}

function positional(args) {
  const valueOptions = new Set(['--port', '--host', '--file', '--json', '--rule', '--scenario', '--limit', '--url', '--method', '--value', '--headers', '--body', '--timeout', '--tab-id']);
  return args.filter((value, index) => !value.startsWith('-') && !valueOptions.has(args[index - 1]));
}

function parsePort(args) {
  const value = Number(option(args, '--port', DEFAULT_PORT));
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : DEFAULT_PORT;
}

async function hydrateBodyFile(source, baseDirectory) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const output = { ...source };
  const bodyFile = output.bodyFile ?? output.responseBodyFile;
  if (bodyFile !== undefined && bodyFile !== null) {
    if (output.body !== undefined || output.responseBody !== undefined) {
      throw Object.assign(new Error('bodyFile cannot be combined with body or responseBody'), { code: 'ambiguous_body_source' });
    }
    const filePath = path.resolve(baseDirectory, String(bodyFile));
    output.body = await fs.readFile(filePath, 'utf8');
    delete output.bodyFile;
    delete output.responseBodyFile;
  }
  if (Array.isArray(output.scenarios)) {
    output.scenarios = await Promise.all(output.scenarios.map((scenario) => hydrateBodyFile(scenario, baseDirectory)));
  }
  if (output.scenario && typeof output.scenario === 'object') {
    output.scenario = await hydrateBodyFile(output.scenario, baseDirectory);
  }
  return output;
}

async function parseRule(args) {
  const file = option(args, '--file');
  const raw = option(args, '--json') || args.find((value) => value.startsWith('{'));
  if (file) {
    const absoluteFile = path.resolve(file);
    const rule = JSON.parse(await fs.readFile(absoluteFile, 'utf8'));
    return hydrateBodyFile(rule, path.dirname(absoluteFile));
  }
  if (!raw) throw Object.assign(new Error('apply requires --json or a JSON rule argument'), { code: 'missing_rule' });
  return hydrateBodyFile(JSON.parse(raw), process.cwd());
}

function commandFromArgs(command, args) {
  const values = positional(args);
  if (command === 'status' || command === 'list') return { name: command };
  if (command === 'apply') return parseRule(args).then((rule) => ({ name: command, payload: { rule } }));
  if (command === 'scenarios') return { name: command, payload: { ruleId: option(args, '--rule') || values[0] } };
  if (command === 'switch') return { name: command, payload: { ruleId: option(args, '--rule') || values[0], scenarioId: option(args, '--scenario') || values[1] } };
  if (['enable', 'disable', 'remove'].includes(command)) return { name: command, payload: { ruleId: option(args, '--rule') || values[0] } };
  if (command === 'global') {
    const value = option(args, '--value') || values[0] || 'off';
    return { name: command, payload: { value, enabled: ['on', 'enable', 'enabled', 'true', '1'].includes(String(value).toLowerCase()) } };
  }
  if (command === 'logs') return { name: command, payload: { limit: Number(option(args, '--limit', 50)) || 50 } };
  if (command === 'match') return { name: command, payload: { url: option(args, '--url', values[0] || ''), method: option(args, '--method', 'GET') } };
  if (command === 'request') {
    const headersText = option(args, '--headers');
    let headers = {};
    if (headersText !== undefined) {
      try { headers = JSON.parse(headersText); } catch {
        throw Object.assign(new Error('headers must be valid JSON'), { code: 'invalid_headers' });
      }
    }
    const input = {
      url: option(args, '--url', values[0] || ''),
      method: option(args, '--method', 'GET'),
      headers,
      ...(args.includes('--body') ? { body: option(args, '--body', '') } : {}),
      ...(option(args, '--timeout') === undefined ? {} : { timeout: option(args, '--timeout') }),
      native: flag(args, '--native'),
      ...(option(args, '--tab-id') === undefined ? {} : { tabId: option(args, '--tab-id') }),
    };
    return { name: command, payload: normalizeBrowserRequest(input) };
  }
  throw Object.assign(new Error(`unknown command: ${command}`), { code: 'unknown_command' });
}

async function rpc(command, port) {
  const response = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command }),
  });
  const value = await response.json();
  return value;
}

async function runDaemon(args) {
  const port = parsePort(args);
  const host = option(args, '--host', '127.0.0.1');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('daemon host must be loopback');
  if (args.includes('--background')) {
    const childArgs = [process.argv[1], 'daemon', ...args.filter((arg) => arg !== '--background')];
    const child = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    const probeHost = host === '::1' ? '[::1]' : host;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://${probeHost}:${port}/health`);
        if (response.ok && (await response.json()).ok) {
          ready = true;
          break;
        }
      } catch { /* detached process is still binding */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!ready) {
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
      throw new Error(`background daemon did not become healthy on port ${port}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (child.exitCode !== null) throw new Error(`background daemon exited before becoming ready (port ${port})`);
    print({ ok: true, data: { pid: child.pid, url: `http://${host}:${port}`, websocket: `ws://${host}:${port}/ws`, port } });
    return;
  }
  const daemon = await startDaemon({ port, host });
  print({ ok: true, data: { url: `http://${host}:${daemon.address.port}`, websocket: `ws://${host}:${daemon.address.port}/ws`, port: daemon.address.port } });
  const stop = async () => {
    await daemon.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await new Promise(() => {});
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    help();
    return;
  }
  if (command === 'daemon') {
    await runDaemon(argv);
    return;
  }
  const port = parsePort(argv);
  const parsed = await commandFromArgs(command, argv);
  const result = await rpc(parsed, port);
  print(result);
}

export { commandFromArgs, hydrateBodyFile, parsePort, parseRule };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    print({ ok: false, error: { code: error.code || 'cli_error', message: error.message || String(error) } });
    process.exitCode = 1;
  });
}
