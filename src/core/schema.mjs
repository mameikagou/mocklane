/**
 * Mocklane's deliberately small, JSON-friendly data model.
 *
 * The same rules are stored in IndexedDB, sent over the daemon socket, and
 * consumed by the browser interceptor, so normalization happens at the
 * boundary and never relies on class instances.
 */

export const SCHEMA_VERSION = 1;
export const MATCH_TYPES = new Set(['contains', 'regex']);

const HTTP_METHOD = /^[A-Z][A-Z0-9$_.-]*$/;

function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix = 'id') {
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function asRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

export function normalizeHeaders(input) {
  const source = typeof Headers !== 'undefined' && input instanceof Headers
    ? Object.fromEntries(input.entries())
    : asRecord(input);
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = String(key).trim().toLowerCase();
    if (!normalizedKey) continue;
    output[normalizedKey] = value == null ? '' : String(value);
  }
  return output;
}

export function normalizeBody(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeStatus(value, fallback = 200) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 200 || numeric > 599) return fallback;
  return numeric;
}

export function normalizeScenario(input = {}, index = 0) {
  const source = asRecord(input);
  const id = String(source.id || source.scenarioId || `scenario_${index + 1}`);
  const name = String(source.name || source.label || id);
  return {
    id,
    name,
    status: normalizeStatus(source.status, 200),
    headers: normalizeHeaders(source.headers),
    // Do not JSON.stringify an empty raw body. An empty response is a useful
    // and intentional scenario (204/empty list/loading state).
    body: normalizeBody(source.body ?? source.responseBody),
  };
}

function uniqueScenarios(input) {
  const used = new Set();
  return input.map((scenario, index) => {
    const normalized = normalizeScenario(scenario, index);
    let id = normalized.id;
    let suffix = 2;
    while (used.has(id)) id = `${normalized.id}-${suffix++}`;
    used.add(id);
    return { ...normalized, id };
  });
}

export function normalizeRule(input = {}, options = {}) {
  const source = asRecord(input);
  const endpoint = String(source.endpoint ?? source.url ?? source.pattern ?? '').trim();
  if (!endpoint) {
    const error = new TypeError('endpoint is required');
    error.code = 'invalid_endpoint';
    throw error;
  }

  const matchType = String(source.matchType ?? source.match ?? 'contains').toLowerCase();
  if (!MATCH_TYPES.has(matchType)) {
    const error = new TypeError(`matchType must be contains or regex (received ${matchType})`);
    error.code = 'invalid_match_type';
    throw error;
  }

  // Optional page scope: the rule only fires on pages whose location.href
  // matches. Empty means "every page" (the pre-scope behavior).
  const page = String(source.page ?? '').trim();
  const pageMatchType = String(source.pageMatchType ?? 'contains').toLowerCase();
  if (!MATCH_TYPES.has(pageMatchType)) {
    const error = new TypeError(`pageMatchType must be contains or regex (received ${pageMatchType})`);
    error.code = 'invalid_match_type';
    throw error;
  }

  const method = String(source.method ?? 'GET').trim().toUpperCase() || 'GET';
  if (!HTTP_METHOD.test(method) && method !== '*') {
    const error = new TypeError(`invalid HTTP method: ${method}`);
    error.code = 'invalid_method';
    throw error;
  }

  const scenarioInput = Array.isArray(source.scenarios)
    ? source.scenarios
    : source.scenario
      ? [source.scenario]
      : [{
        id: 'default',
        name: 'Default',
        status: source.status,
        headers: source.headers,
        body: source.body ?? source.responseBody,
      }];
  const scenarios = uniqueScenarios(scenarioInput.length ? scenarioInput : [{ id: 'default', name: 'Default' }]);
  const requestedActive = source.activeScenarioId ?? source.activeScenario ?? scenarios[0].id;
  const activeScenarioId = scenarios.some((scenario) => scenario.id === requestedActive)
    ? String(requestedActive)
    : scenarios[0].id;
  const now = options.now || nowIso();

  return {
    id: String(source.id || makeId('rule')),
    endpoint,
    page,
    pageMatchType,
    matchType,
    method,
    enabled: source.enabled !== false,
    scenarios,
    activeScenarioId,
    createdAt: String(source.createdAt || now),
    updatedAt: String(source.updatedAt || now),
    // Read-only counters maintained by recordHit; client input is ignored.
    hitCount: Number.isInteger(Number(source.hitCount)) && Number(source.hitCount) > 0 ? Number(source.hitCount) : 0,
    lastHitAt: String(source.lastHitAt || ''),
  };
}

export function normalizeRuleList(rules, options = {}) {
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => normalizeRule(rule, options));
}

export function createEmptyState() {
  return {
    version: SCHEMA_VERSION,
    globalEnabled: false,
    rules: [],
    logs: [],
  };
}

export function normalizeHit(input = {}) {
  const source = asRecord(input);
  return {
    id: String(source.id || makeId('hit')),
    ruleId: String(source.ruleId || ''),
    endpoint: String(source.endpoint || ''),
    url: String(source.url || ''),
    method: String(source.method || 'GET').toUpperCase(),
    scenarioId: String(source.scenarioId || ''),
    status: normalizeStatus(source.status, 200),
    // The page that triggered the hit — the environment dimension.
    pageUrl: String(source.pageUrl || ''),
    timestamp: String(source.timestamp || nowIso()),
  };
}

export function normalizeState(input = {}) {
  const source = asRecord(input);
  const state = createEmptyState();
  state.globalEnabled = source.globalEnabled === true;
  state.rules = normalizeRuleList(source.rules, { now: source.updatedAt || undefined });
  state.logs = Array.isArray(source.logs)
    ? source.logs.slice(-500).map(normalizeHit)
    : [];
  return state;
}
