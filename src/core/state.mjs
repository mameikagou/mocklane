import {
  createEmptyState,
  makeId,
  normalizeHit,
  normalizeRule,
  normalizeState,
} from './schema.mjs';
import { matchSummary } from './matcher.mjs';

const MAX_LOGS = 500;

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function applyStateCommand(inputState, command = {}) {
  const state = normalizeState(inputState);
  const name = String(command.name || command.command || '').toLowerCase();
  const payload = command.payload && typeof command.payload === 'object' ? command.payload : command;

  try {
    if (name === 'status') {
      return {
        ok: true,
        data: {
          version: state.version,
          globalEnabled: state.globalEnabled,
          ruleCount: state.rules.length,
          logCount: state.logs.length,
          rules: state.rules.map((rule) => ({
            id: rule.id,
            endpoint: rule.endpoint,
            enabled: rule.enabled,
            activeScenarioId: rule.activeScenarioId,
          })),
        },
        state,
      };
    }

    if (name === 'list') {
      return { ok: true, data: state.rules, state };
    }

    if (name === 'apply') {
      const inputRule = payload.rule || payload;
      const rule = normalizeRule(inputRule);
      const index = state.rules.findIndex((candidate) => candidate.id === rule.id);
      if (index >= 0) state.rules[index] = rule;
      else state.rules.push(rule);
      return { ok: true, data: rule, state };
    }

    if (name === 'scenarios') {
      const rule = state.rules.find((candidate) => candidate.id === String(payload.ruleId || payload.id));
      if (!rule) return failure('rule_not_found', `rule not found: ${payload.ruleId || payload.id || ''}`);
      return { ok: true, data: { ruleId: rule.id, activeScenarioId: rule.activeScenarioId, scenarios: rule.scenarios }, state };
    }

    if (name === 'switch') {
      const rule = state.rules.find((candidate) => candidate.id === String(payload.ruleId || payload.id));
      if (!rule) return failure('rule_not_found', `rule not found: ${payload.ruleId || payload.id || ''}`);
      const scenarioId = String(payload.scenarioId || payload.scenario || '');
      if (!rule.scenarios.some((scenario) => scenario.id === scenarioId)) {
        return failure('scenario_not_found', `scenario not found: ${scenarioId}`);
      }
      rule.activeScenarioId = scenarioId;
      rule.updatedAt = new Date().toISOString();
      return { ok: true, data: rule, state };
    }

    if (name === 'enable' || name === 'disable') {
      const ruleId = String(payload.ruleId || payload.id || '');
      const rule = state.rules.find((candidate) => candidate.id === ruleId);
      if (!rule) return failure('rule_not_found', `rule not found: ${ruleId}`);
      rule.enabled = name === 'enable';
      rule.updatedAt = new Date().toISOString();
      return { ok: true, data: rule, state };
    }

    if (name === 'remove') {
      const ruleId = String(payload.ruleId || payload.id || '');
      const index = state.rules.findIndex((candidate) => candidate.id === ruleId);
      if (index < 0) return failure('rule_not_found', `rule not found: ${ruleId}`);
      const [removed] = state.rules.splice(index, 1);
      return { ok: true, data: removed, state };
    }

    if (name === 'global') {
      let enabled = payload.enabled;
      if (typeof enabled !== 'boolean') {
        enabled = ['on', 'enable', 'enabled', 'true', '1'].includes(String(payload.value || payload.mode || '').toLowerCase());
      }
      state.globalEnabled = enabled === true;
      return { ok: true, data: { globalEnabled: state.globalEnabled }, state };
    }

    if (name === 'logs') {
      const limit = Math.max(1, Math.min(500, Number(payload.limit) || 50));
      return { ok: true, data: state.logs.slice(-limit).reverse(), state };
    }

    if (name === 'match') {
      return {
        ok: true,
        data: matchSummary(state.rules, { url: payload.url, method: payload.method }, { globalEnabled: state.globalEnabled }),
        state,
      };
    }

    return failure('unknown_command', `unknown command: ${name || '(empty)'}`);
  } catch (error) {
    return failure(error.code || 'invalid_command', error.message || String(error));
  }
}

export function recordHit(inputState, hitInput) {
  const state = normalizeState(inputState);
  const hit = normalizeHit({ ...hitInput, id: hitInput?.id || makeId('hit') });
  state.logs = [...state.logs, hit].slice(-MAX_LOGS);
  // Per-rule counters power the dashboard "now serving" view. They live in
  // the same state write as the log append, so they can never drift apart.
  const rule = hit.ruleId ? state.rules.find((candidate) => candidate.id === hit.ruleId) : undefined;
  if (rule) {
    rule.hitCount += 1;
    rule.lastHitAt = hit.timestamp;
  }
  return { state, hit };
}

export function createState() {
  return createEmptyState();
}
