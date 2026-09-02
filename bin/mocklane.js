#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { startDaemon } from '../src/daemon/server.mjs';
import { normalizeBrowserRequest } from '../src/core/request.mjs';

const DEFAULT_PORT = 17321;
const DEFAULT_WAIT_TIMEOUT_MS = 15000;
// A forgotten wait must die; 10 minutes is far beyond any real page action.
const MAX_WAIT_TIMEOUT_MS = 600000;

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
        wait: 'wait [--rule <rule-id>] [--scenario <scenario-id>] [--timeout ms] (blocks until a matching hit)',
        journey: 'journey --file <journey.json> (runs switch/apply/enable/disable/global/wait steps, one JSON line each)',
        report: 'report (session summary: per-rule hit counts, never-hit rules, gate state)',
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

function cliFailure(code, message) {
  return { ok: false, error: { code, message } };
}

function parseWaitTimeout(value) {
  if (value === undefined) return DEFAULT_WAIT_TIMEOUT_MS;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > MAX_WAIT_TIMEOUT_MS) {
    throw Object.assign(
      new Error(`timeout must be an integer between 1 and ${MAX_WAIT_TIMEOUT_MS} ms`),
      { code: 'invalid_timeout' },
    );
  }
  return timeout;
}

// Subscribes to the daemon event stream as role `cli` and blocks until a hit
// matches the filters. Only future hits count — this is an assertion primitive:
// start the wait, then drive the page. Past hits are `logs`' job.
function waitForHit({ ruleId, scenarioId, timeout }, port) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch { /* already closed */ }
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish(cliFailure('wait_timeout', `no matching hit within ${timeout} ms`));
    }, timeout);
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    } catch {
      finish(cliFailure('daemon_unreachable', `could not reach the daemon on port ${port}`));
      return;
    }
    socket.on('error', () => finish(cliFailure('daemon_unreachable', `could not reach the daemon on port ${port}`)));
    socket.on('open', () => socket.send(JSON.stringify({ kind: 'hello', role: 'cli' })));
    socket.on('message', (data) => {
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (message.kind === 'hello' && message.extensionConnected === false) {
        finish(cliFailure('extension_not_connected', 'Mocklane extension is not connected'));
        return;
      }
      if (message.kind === 'event' && message.event === 'connections' && message.extensionConnected === false) {
        finish(cliFailure('extension_disconnected', 'Mocklane extension disconnected while waiting'));
        return;
      }
      if (message.kind !== 'event' || message.event !== 'hit' || !message.hit) return;
      const hit = message.hit;
      if (ruleId && hit.ruleId !== ruleId) return;
      if (scenarioId && hit.scenarioId !== scenarioId) return;
      finish({ ok: true, data: { hit } });
    });
  });
}

const JOURNEY_ACTIONS = new Set(['apply', 'switch', 'enable', 'disable', 'global', 'wait']);

function journeyError(message) {
  return Object.assign(new Error(message), { code: 'invalid_journey' });
}

function normalizeJourney(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw journeyError('journey file must be a JSON object');
  }
  const steps = source.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw journeyError('journey requires a non-empty steps array');
  }
  steps.forEach((step, index) => {
    const keys = step && typeof step === 'object' && !Array.isArray(step) ? Object.keys(step) : [];
    if (keys.length !== 1 || !JOURNEY_ACTIONS.has(keys[0])) {
      throw journeyError(`step ${index} must have exactly one action (${[...JOURNEY_ACTIONS].join(', ')})`);
    }
  });
  return { name: String(source.journey || source.name || 'journey'), steps };
}

// Each step maps onto the same command path its standalone CLI command uses;
// journey is orchestration, not a second implementation.
async function runJourneyStep(step, baseDirectory, port) {
  const action = Object.keys(step)[0];
  const config = step[action];
  if (action === 'switch') {
    if (!config?.rule || !config?.scenario) throw journeyError('switch step requires { rule, scenario }');
    return rpc({ name: 'switch', payload: { ruleId: config.rule, scenarioId: config.scenario } }, port);
  }
  if (action === 'enable' || action === 'disable') {
    if (!config?.rule) throw journeyError(`${action} step requires { rule }`);
    return rpc({ name: action, payload: { ruleId: config.rule } }, port);
  }
  if (action === 'global') {
    const value = typeof config === 'string' ? config : config?.value;
    const enabled = ['on', 'enable', 'enabled', 'true', '1'].includes(String(value).toLowerCase());
    return rpc({ name: 'global', payload: { value, enabled } }, port);
  }
  if (action === 'apply') {
    let rule;
    if (config?.file) {
      const rulePath = path.resolve(baseDirectory, String(config.file));
      rule = await hydrateBodyFile(JSON.parse(await fs.readFile(rulePath, 'utf8')), path.dirname(rulePath));
    } else if (config?.rule && typeof config.rule === 'object') {
      rule = await hydrateBodyFile(config.rule, baseDirectory);
    } else {
      throw journeyError('apply step requires { file } or { rule }');
    }
    return rpc({ name: 'apply', payload: { rule } }, port);
  }
  // wait
  const waitConfig = config && typeof config === 'object' ? config : {};
  return waitForHit({
    ruleId: waitConfig.rule ? String(waitConfig.rule) : undefined,
    scenarioId: waitConfig.scenario ? String(waitConfig.scenario) : undefined,
    timeout: parseWaitTimeout(waitConfig.timeout === undefined ? undefined : String(waitConfig.timeout)),
  }, port);
}

async function runJourney(args, port) {
  const file = option(args, '--file') || positional(args)[0];
  if (!file) {
    throw Object.assign(new Error('journey requires --file <journey.json>'), { code: 'missing_journey_file' });
  }
  const absoluteFile = path.resolve(file);
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(absoluteFile, 'utf8'));
  } catch (error) {
    throw Object.assign(new Error(`journey file is not readable JSON: ${error.message}`), { code: 'invalid_journey_file' });
  }
  const journey = normalizeJourney(parsed);
  const baseDirectory = path.dirname(absoluteFile);
  for (let index = 0; index < journey.steps.length; index += 1) {
    const step = journey.steps[index];
    const action = Object.keys(step)[0];
    let result;
    try {
      result = await runJourneyStep(step, baseDirectory, port);
    } catch (error) {
      result = cliFailure(error.code || 'journey_step_error', error.message || String(error));
    }
    print({ ok: result.ok === true, step: index, action, ...(result.ok ? { data: result.data } : { error: result.error }) });
    if (!result.ok) {
      process.exitCode = 1;
      return;
    }
  }
  print({ ok: true, journey: journey.name, steps: journey.steps.length });
}

async function runReport(port) {
  const status = await rpc({ name: 'status' }, port);
  if (!status.ok) return status;
  const list = await rpc({ name: 'list' }, port);
  if (!list.ok) return list;
  const rules = Array.isArray(list.data) ? list.data : [];
  const totalHits = rules.reduce((sum, rule) => sum + (rule.hitCount || 0), 0);
  return {
    ok: true,
    data: {
      globalEnabled: status.data?.globalEnabled === true,
      totalHits,
      rules: rules.map((rule) => ({
        id: rule.id,
        endpoint: rule.endpoint,
        enabled: rule.enabled,
        activeScenarioId: rule.activeScenarioId,
        hitCount: rule.hitCount || 0,
        lastHitAt: rule.lastHitAt || '',
      })),
      neverHit: rules.filter((rule) => !rule.hitCount).map((rule) => rule.id),
    },
  };
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
  if (command === 'wait') {
    const result = await waitForHit({
      ruleId: option(argv, '--rule'),
      scenarioId: option(argv, '--scenario'),
      timeout: parseWaitTimeout(option(argv, '--timeout')),
    }, port);
    print(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === 'journey') {
    await runJourney(argv, port);
    return;
  }
  if (command === 'report') {
    print(await runReport(port));
    return;
  }
  const parsed = await commandFromArgs(command, argv);
  const result = await rpc(parsed, port);
  print(result);
}

export { commandFromArgs, hydrateBodyFile, normalizeJourney, parsePort, parseRule, parseWaitTimeout, waitForHit };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    print({ ok: false, error: { code: error.code || 'cli_error', message: error.message || String(error) } });
    process.exitCode = 1;
  });
}
