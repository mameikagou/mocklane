# PLANNING-3 · Environment-scoped interception (page scope + named envs)

> Owner requirement, verbatim: "按照环境和泳道的粒度拦截区分……环境要支持
> 拓展，切换和对比……只是为了你在 mock 的时候，不影响我其他网页不被 mock。"

## Purpose

Today a rule matches **any page** that loads the extension: enable a mock for a
swimlane and the same endpoint gets mocked on the production tab too. This plan
adds environment granularity so interception is scoped to the pages it belongs
to — with safety as the primary goal and environment ergonomics (extensible,
switchable, comparable) on top.

## Design decisions

### 1. Rule-level page scope (the safety primitive)

Rules gain two optional fields:

```json
{ "page": "//selftest-260821-104730-989-sl-qnh.", "pageMatchType": "contains" }
```

- The MAIN-world interceptor matches `page` against the page's own
  `location.href` (not the request URL — the page IS the environment).
- **Fail-closed**: a rule with `page` set never fires when the page URL is
  unknown or doesn't match. No page scope = behaves exactly as today
  (backward compatible).
- Matching against full `href` covers host, path, and query (`bizMode=…`).
- `pageMatchType` reuses the existing `contains | regex` vocabulary.
- The `//` prefix is the documented idiom for host-anchored patterns:
  `//qnh.shangou.st.` matches ST but not test (plain `st.` would also match
  `te**st.**`), and `//qnh.shangou.test.` matches test but not the swimlane
  host `selftest-…-sl-qnh.shangou.test.meituan.com`.

### 2. Named environments (extensible + switchable) — CLI layer, not extension

The extension stays dumb: it only ever sees resolved `page` patterns. Named
envs are a CLI-side preset file (default `./envs.json`, override `--envs`):

```json
{
  "local":    { "page": "//localhost:3000" },
  "swimlane": { "page": "//selftest-260821-104730-989-sl-qnh." },
  "test":     { "page": "//qnh.shangou.test." },
  "st":       { "page": "//qnh.shangou.st." },
  "prod":     { "page": "//qnh.meituan.com/" }
}
```

- Rule JSON may say `"env": "swimlane"`; the CLI resolves it to `page` at
  `apply` time (works in `apply --file`, `--json`, and journey apply steps).
- **Extensible**: add a key, done. Nothing is hardcoded — no company domains
  in the product.
- **Switchable**: re-apply the same rule file with a different `env`; nothing
  else changes. A new swimlane = one new env entry, not N rewritten rules.
- `env` + inline `page` together is rejected (`ambiguous_page_scope`);
  unknown names fail with `unknown_env` listing the available ones.

### 3. Environment comparison — hits record where they happened

- Hits gain `pageUrl` (the page's `location.href` at interception time).
- `mocklane report` gains an `envs` breakdown: hits grouped by page host, so
  "did the same rule fire in the swimlane and in test?" is one command.
- `mocklane wait --page <substring>` filters hits by page URL — assert that a
  hit happened **in the right environment**, not just anywhere.
- `mocklane match --page-url <url>` dry-runs the full rule+page decision.

## Files that change

| File | Change |
|---|---|
| `src/core/schema.mjs` | `normalizeRule`: `page`/`pageMatchType`; `normalizeHit`: `pageUrl` |
| `src/core/matcher.mjs` | `matchesRule`: fail-closed page check against `request.pageUrl` |
| `src/core/interceptor.mjs` | thread page URL getter; hits carry `pageUrl` |
| `src/extension/interceptor.js` | wire `window.location.href` getter |
| `src/core/state.mjs` | `match` command passes `payload.pageUrl` |
| `bin/mocklane.js` | env preset resolution (`--envs`, `envs.json`), `match --page-url`, `wait --page`, `report` env breakdown |
| `dashboard/src/features/rules/EndpointRow.jsx` | show page scope in rule meta |
| `test/core.test.mjs` · `test/cli.test.mjs` | page matching, env resolution, anchors, wait --page |
| `skills/browser-mock/` + `README.md` | env recipes with the five real environments |

## Explicitly out of scope

- No environment state in the extension/IndexedDB (presets are a CLI concern;
  resolved rules stay the single source of truth).
- No global "current env" switch — scope stays explicit per rule, because an
  implicit global scope is exactly how other pages get mocked by accident.
- No dashboard env editing (dashboard stays the observer).

## Acceptance

1. All checks green: lint, typecheck, test, build.
2. A rule with `"env": "test"` does not fire on the swimlane page, and vice
   versa (matcher tests with the real hostnames).
3. A rule with `page` never fires when `pageUrl` is empty (fail-closed test).
4. `report` shows per-environment hit groups from real hit `pageUrl`s.
5. One-line-JSON contract preserved; docs carry the five-environment recipe.
