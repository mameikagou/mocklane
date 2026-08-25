---
name: browser-mock
description: Use Mocklane whenever a user or coding agent needs deterministic browser API responses, temporary Fetch/XHR mocks, endpoint scenarios, mock switches, or hit-log inspection in Chrome or Tabbit. Prefer the Mocklane CLI for creating and changing rules, and use the dashboard only for observing connection/state or switching an existing scenario.
---

# Browser API mocking with Mocklane

Mocklane is a local Chrome MV3 extension plus a localhost relay. The extension stores rules and hit logs in IndexedDB. The daemon only relays commands and events, so do not look for a daemon database or edit daemon state files.

## Start and connect

From the Mocklane project:

```bash
npm install
npm run build
node bin/mocklane.js daemon --background
```

The command returns the daemon PID and address as JSON. Load `dist/extension` as an unpacked extension in Chrome. The dashboard is at `http://127.0.0.1:17321/`. The default global switch is off. The extension always connects to `127.0.0.1:17321`; use `daemon --port` only for an isolated dashboard/CLI daemon and do not expect the extension to follow it.

## CLI-first workflow

1. Check the bridge with `node bin/mocklane.js status`.
2. Add or replace a rule with `node bin/mocklane.js apply --json '<rule JSON>'`.
3. Inspect the normalized rule using `list` or `scenarios <rule-id>`.
4. Turn on only the intended rule with `enable <rule-id>`, then turn on the global switch with `global on`.
5. Switch scenarios with `switch <rule-id> <scenario-id>`.
6. Verify traffic with `logs --limit 20` or `match --url '<URL>' --method GET`.
7. Turn the global switch off after the task with `global off`.

Every command emits one stable JSON object. Treat `{ "ok": false, "error": ... }` as a failed operation and surface the error message instead of retrying destructive commands blindly.

The browser stores rules and logs in IndexedDB. The daemon has no durable state. `status`, `list`, `scenarios`, `logs`, and `match` are read-only queries; they do not write or broadcast state. A browser hit records one log entry and emits one transient hit event.

## Rule guidance

- Use `contains` for a stable path fragment and `regex` only when the URL shape needs it.
- Specify `method`; it defaults to `GET` and is case-normalized.
- Keep multiple response states as scenarios on one endpoint. Change `activeScenarioId` with `switch` rather than duplicating the rule.
- Bodies are raw strings. Use `"body":""` for an empty response and JSON-encode JSON bodies yourself in the rule JSON.
- Use an explicit `status` and `headers` for response behavior that the browser code under test observes.

Read [`references/schema.md`](references/schema.md) before generating a complex rule or troubleshooting a command payload.

## Safety and cleanup

Mocklane matches only the configured method and URL pattern. Before investigating a browser failure, run `global off` to confirm native behavior. After a focused test, disable the rule or remove it with `remove <rule-id>` and leave the global switch off.

Do not add Mock.js, declarativeNetRequest rules, page scripts, iframes, DevTools panels, cloud storage, or a second persistence layer. The extension's MAIN-world interceptor and isolated bridge are intentionally small.
