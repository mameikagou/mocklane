---
name: browser-mock
description: Use Mocklane whenever a user or coding agent needs deterministic browser API responses, temporary Fetch/XHR mocks, endpoint scenarios, mock switches, or hit-log inspection in Chrome or Tabbit. Prefer the Mocklane CLI for creating and changing rules, and use the dashboard only for observing connection/state or switching an existing scenario.
---

# Browser API mocking with Mocklane

Mocklane is a local Chrome MV3 extension plus a localhost relay. The extension stores rules and hit logs in IndexedDB. The daemon only relays commands and events, so do not look for a daemon database or edit daemon state files.

## Start and connect

From the Mocklane project:

```bash
bun install --frozen-lockfile
bun run build
bun run bin/mocklane.js daemon --background
```

The command returns the daemon PID and address as JSON. Load `dist/extension` as an unpacked extension in Chrome. The dashboard is at `http://127.0.0.1:17321/`. The default global switch is off. The extension always connects to `127.0.0.1:17321`; use `daemon --port` only for an isolated dashboard/CLI daemon and do not expect the extension to follow it.

## CLI-first workflow

1. Check the bridge with `bun run bin/mocklane.js status`.
2. Add or replace a rule with `bun run bin/mocklane.js apply --json '<rule JSON>'`.
3. Inspect the normalized rule using `list` or `scenarios <rule-id>`.
4. Turn on only the intended rule with `enable <rule-id>`, then turn on the global switch with `global on`.
5. Switch scenarios with `switch <rule-id> <scenario-id>`.
6. Verify traffic with `logs --limit 20` or `match --url '<URL>' --method GET`.
7. Turn the global switch off after the task with `global off`.

Every command emits one stable JSON object. Treat `{ "ok": false, "error": ... }` as a failed operation and surface the error message instead of retrying destructive commands blindly.

The browser stores rules and logs in IndexedDB. The daemon has no durable state. `status`, `list`, `scenarios`, `logs`, and `match` are read-only queries; they do not write or broadcast state. A browser hit records one log entry and emits one transient hit event.

## Verify the loop: wait, journey, report

`wait` is the assertion primitive — it blocks until the page actually triggers a matching hit, so you never need to poll `logs` in a loop:

```bash
bun run bin/mocklane.js wait --rule user-list --scenario ok --timeout 10000
```

It prints `{"ok":true,"data":{"hit":{...}}}` on the first matching hit, or a stable error code: `wait_timeout`, `extension_not_connected` (fail-fast), `extension_disconnected` (mid-wait), or `daemon_unreachable`. Only future hits count — start the wait first, then drive the page; use `logs` for traffic that already happened. Default timeout is 15000 ms (max 600000). Exit code is 1 on any failure.

`journey` runs a scenario chain from a JSON file, one JSON line per step:

```json
{
  "journey": "checkout-timeout",
  "steps": [
    { "switch": { "rule": "checkout", "scenario": "timeout" } },
    { "wait":   { "rule": "checkout", "scenario": "timeout", "timeout": 10000 } },
    { "switch": { "rule": "checkout", "scenario": "ok" } }
  ]
}
```

Each step is one action — `apply` (`{"apply":{"file":"rule.json"}}` resolves relative to the journey file, or `{"apply":{"rule":{...}}}` inline), `switch`, `enable`, `disable`, `global` (`{"global":"on"}`), or `wait`. Steps execute in order against the same command paths as the standalone CLI; the first failing step prints its error line, stops the run, and sets exit code 1. A successful run ends with `{"ok":true,"journey":"checkout-timeout","steps":3}`. Between step lines you can run your own browser/rendering checks — Mocklane only owns the interface layer.

`report` summarizes the session: per-rule `hitCount`/`lastHitAt`, `totalHits`, `neverHit` rule ids (wasted config), and the gate state — read it before tearing down to confirm every configured rule actually fired.

## Debugging a page request

Use `request` only when a deterministic page-context request is useful for debugging a loaded page:

```bash
bun run bin/mocklane.js request --url 'https://example.test/api/users' --method GET
bun run bin/mocklane.js request --url 'https://example.test/api/orders' --method POST \
  --headers '{"content-type":"application/json"}' --body '{"preview":true}' --timeout 5000
bun run bin/mocklane.js request --url 'https://example.test/api/users' --native
```

The default target is the active tab; `--tab-id ID` selects one explicit tab. Browser-internal, extension, and Mocklane dashboard tabs are rejected. Default requests use that page's intercepted `window.fetch`; `--native` uses the original fetch saved before Mocklane installed its wrapper. The command returns stable JSON containing `status`, `headers`, and raw `body`, or a stable error code for network/CORS, timeout, missing bridge, or an unavailable tab. Response bodies are limited to 2 MiB. This is an execution/debugging helper, not a substitute for the application's own business call; it will not make React state update unless the page's normal code consumes the response.

If application code hides a feature or returns early before issuing a request, do not use `request` as proof that the application works. An explicit runtime-only switch may bypass the UI gate, but it must not replace the business endpoint or add Mocklane fields to the request payload. Configure the rule against the same URL and method used by the real backend, then let the application's unchanged Fetch/XHR call consume the mocked response through its normal state-update path.

## Rule guidance

- Use `contains` for a stable path fragment and `regex` only when the URL shape needs it.
- Specify `method`; it defaults to `GET` and is case-normalized.
- Keep multiple response states as scenarios on one endpoint. Change `activeScenarioId` with `switch` rather than duplicating the rule.
- Bodies are raw strings. Use `"body":""` for an empty response. With `apply --file`, prefer `"bodyFile":"payload.json"` when a JSON response is easier to maintain separately; the CLI resolves it relative to the rule file before sending the rule to the extension.
- Use an explicit `status` and `headers` for response behavior that the browser code under test observes.

Read [`references/schema.md`](references/schema.md) before generating a complex rule or troubleshooting a command payload.

## Safety and cleanup

Mocklane matches only the configured method and URL pattern. Before investigating a browser failure, run `global off` to confirm native behavior. After a focused test, disable the rule or remove it with `remove <rule-id>` and leave the global switch off.

Do not add Mock.js, declarativeNetRequest rules, page scripts, iframes, DevTools panels, cloud storage, or a second persistence layer. The extension's MAIN-world interceptor and isolated bridge are intentionally small.
