import { normalizeRule } from './schema.mjs';

export function normalizeRequest(input = {}) {
  const source = input || {};
  return {
    url: String(source.url ?? ''),
    method: String(source.method || 'GET').toUpperCase(),
    // The page performing the request (location.href). Rules with a page
    // scope match against this — the page IS the environment dimension.
    pageUrl: String(source.pageUrl ?? ''),
  };
}

function regexFromPattern(pattern) {
  const text = String(pattern || '');
  // Accept a familiar /source/flags spelling while keeping plain patterns
  // (the documented format) as-is.
  const slash = text.match(/^\/(.*)\/([dgimsuvy]*)$/s);
  try {
    return slash ? new RegExp(slash[1], slash[2]) : new RegExp(text);
  } catch {
    return null;
  }
}

function matchesPageScope(rule, pageUrl) {
  const pattern = String(rule.page || '');
  if (!pattern) return true;
  // Fail closed: a scoped rule must never fire where the page is unknown.
  if (!pageUrl) return false;
  if (rule.pageMatchType === 'regex') {
    const expression = regexFromPattern(pattern);
    return Boolean(expression && expression.test(pageUrl));
  }
  return pageUrl.includes(pattern);
}

export function matchesRule(ruleInput, requestInput) {
  const rule = ruleInput;
  const request = normalizeRequest(requestInput);
  if (!rule || rule.enabled === false) return false;
  if (!matchesPageScope(rule, request.pageUrl)) return false;
  if (rule.method !== '*' && String(rule.method || 'GET').toUpperCase() !== request.method) return false;
  if (rule.matchType === 'regex') {
    const expression = regexFromPattern(rule.endpoint);
    return Boolean(expression && expression.test(request.url));
  }
  return request.url.includes(String(rule.endpoint || ''));
}

export function activeScenario(rule) {
  if (!rule || !Array.isArray(rule.scenarios)) return null;
  return rule.scenarios.find((scenario) => scenario.id === rule.activeScenarioId)
    || rule.scenarios[0]
    || null;
}

export function findMatchingRule(rules, request, options = {}) {
  const globalEnabled = options.globalEnabled !== false;
  if (!globalEnabled || !Array.isArray(rules)) return null;
  for (const candidate of rules) {
    if (matchesRule(candidate, request)) {
      const scenario = activeScenario(candidate);
      if (scenario) return { rule: candidate, scenario };
    }
  }
  return null;
}

export function matchSummary(rules, request, options = {}) {
  const matched = findMatchingRule(rules, request, options);
  if (!matched) return { matched: false, request: normalizeRequest(request) };
  return {
    matched: true,
    request: normalizeRequest(request),
    rule: matched.rule,
    scenario: matched.scenario,
  };
}

// Useful for callers accepting an untrusted JSON rule in one step.
export function normalizeAndMatch(rules, request, options = {}) {
  const normalized = Array.isArray(rules) ? rules.map((rule) => normalizeRule(rule)) : [];
  return matchSummary(normalized, request, options);
}
