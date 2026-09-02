# Mocklane v1 schema reference

## Rule

```json
{
  "id": "string (optional; generated when omitted)",
  "endpoint": "string, required",
  "matchType": "contains | regex (default contains)",
  "method": "HTTP method (default GET; * matches every method)",
  "enabled": "boolean (default true)",
  "scenarios": [
    {
      "id": "string, unique within the rule",
      "name": "string",
      "status": "integer 200..599 (default 200; Fetch-compatible)",
      "headers": {"header-name": "string value"},
      "body": "raw string; an omitted/null body normalizes to an empty string",
      "bodyFile": "CLI-only alternative to body; relative to the rule file"
    }
  ],
  "activeScenarioId": "must point at one scenario",
  "hitCount": "integer, read-only; incremented by the extension on every matching hit",
  "lastHitAt": "ISO-8601 string, read-only; timestamp of the most recent hit (empty until first hit)"
}
```

`apply` also accepts one `scenario` object or top-level `status`, `headers`, and `body` as a convenience for a one-scenario rule. When using `apply --file`, `bodyFile` (or `responseBodyFile`) may replace `body` at the top level or inside a scenario, referencing a **standalone payload file**. The CLI resolves it relative to the rule file and sends the file contents as `body`; combining both sources on the same slot is rejected. The intended layout for real rules is one rule file plus a `payloads/` folder, as in `examples/` (`ai-store-launch-query.json` / `ai-store-launch-execute.json` + `payloads/`). Header names are normalized to lowercase. Scenario IDs are de-duplicated with a numeric suffix when necessary.

Mocklane returns a response before the native network call, but does not rewrite the intercepted request. Keep the rule endpoint and method identical to the real API. UI preview flags belong outside the business payload, and response/mock metadata belongs in the rule or a referenced payload file.

## State owned by the extension

```json
{
  "version": 1,
  "globalEnabled": false,
  "rules": "normalized Rule[]",
  "logs": [
    {
      "id": "string",
      "ruleId": "string",
      "endpoint": "string",
      "url": "string",
      "method": "GET",
      "scenarioId": "string",
      "status": 200,
      "timestamp": "ISO-8601 string"
    }
  ]
}
```

The extension caps logs at the latest 500 entries. The daemon never stores this state.

## Command payloads

The CLI converts positional arguments to these command objects before sending them to the daemon:

| CLI | Command object |
| --- | --- |
| `status` | `{ "name": "status" }` |
| `list` | `{ "name": "list" }` |
| `apply --json '{...}'` | `{ "name": "apply", "payload": { "rule": {...} } }` |
| `scenarios rule-id` | `{ "name": "scenarios", "payload": { "ruleId": "rule-id" } }` |
| `switch rule-id scenario-id` | `{ "name": "switch", "payload": { "ruleId": "rule-id", "scenarioId": "scenario-id" } }` |
| `enable/disable/remove rule-id` | `{ "name": "enable|disable|remove", "payload": { "ruleId": "rule-id" } }` |
| `global on\|off` | `{ "name": "global", "payload": { "enabled": true\|false } }` |
| `logs --limit 20` | `{ "name": "logs", "payload": { "limit": 20 } }` |
| `match --url URL --method POST` | `{ "name": "match", "payload": { "url": "URL", "method": "POST" } }` |
| `request --url URL [options]` | `{ "name": "request", "payload": { "url": "URL", "method": "GET", "headers": {}, "timeout": 10000, "native": false, "tabId": 17 } }` |

Successful responses are `{ "ok": true, "data": ... }`. Errors use `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

## Page request payload and result

`request` accepts an absolute `http` or `https` URL (or a page-relative path such as `/api/users`), an optional HTTP method (default `GET`), JSON object headers, an optional raw string body, a timeout from 1 to 30000 milliseconds, `--native`, and an optional tab ID. It uses the active tab when `tabId` is omitted and never writes rule state. A matched request may append the normal hit log entry.

```json
{
  "ok": true,
  "data": {
    "url": "https://example.test/api/users",
    "status": 200,
    "headers": {"content-type": "application/json"},
    "body": "[{\"id\":1}]"
  }
}
```

Common stable request errors include `missing_url`, `invalid_url`, `invalid_headers`, `invalid_timeout`, `body_not_allowed`, `no_available_tab`, `tab_not_found`, `unsupported_tab`, `dashboard_tab_forbidden`, `tab_bridge_unavailable`, `request_timeout`, `network_error`, `response_too_large`, and `native_fetch_unavailable`.

## Verification commands (wait / journey / report)

These commands run in the CLI itself; the daemon relays the extension's event stream to CLI subscribers. They never mutate rule state.

`wait [--rule <rule-id>] [--scenario <scenario-id>] [--timeout ms]` subscribes to live hit events and blocks until a hit matches every given filter (omitted filters match anything). Only hits that arrive after the wait starts count. Default timeout 15000 ms, maximum 600000 ms. Success:

```json
{ "ok": true, "data": { "hit": { "id": "...", "ruleId": "user-list", "endpoint": "/api/users", "url": "https://example.test/api/users", "method": "GET", "scenarioId": "ok", "status": 200, "timestamp": "..." } } }
```

Stable errors: `wait_timeout`, `extension_not_connected` (fail-fast at subscribe time), `extension_disconnected` (mid-wait), `daemon_unreachable`, `invalid_timeout`. Exit code is 1 on any failure.

`journey --file <journey.json>` executes a scenario chain. The file is `{ "journey": "name", "steps": [ ... ] }` where each step is an object with exactly one action key:

| Step | Payload |
| --- | --- |
| `{ "apply": ... }` | `{ "file": "rule.json" }` (relative to the journey file; `bodyFile` inside resolves relative to the rule file) or `{ "rule": {...} }` (inline; `bodyFile` resolves relative to the journey file) |
| `{ "switch": ... }` | `{ "rule": "rule-id", "scenario": "scenario-id" }` |
| `{ "enable" / "disable": ... }` | `{ "rule": "rule-id" }` |
| `{ "global": ... }` | `"on"` / `"off"` or `{ "value": "on" }` |
| `{ "wait": ... }` | `{ "rule": "rule-id", "scenario": "scenario-id", "timeout": 10000 }` (all optional, same semantics as standalone `wait`) |

Each step prints one line: `{ "ok": true, "step": 0, "action": "switch", "data": {...} }`. The first failing step prints its error, stops the run, and sets exit code 1. A clean run ends with `{ "ok": true, "journey": "name", "steps": 3 }`. File-level errors use `missing_journey_file`, `invalid_journey_file`, or `invalid_journey`.

`report` composes `status` + `list` into a session summary:

```json
{
  "ok": true,
  "data": {
    "globalEnabled": false,
    "totalHits": 12,
    "rules": [
      { "id": "user-list", "endpoint": "/api/users", "enabled": true, "activeScenarioId": "ok", "hitCount": 12, "lastHitAt": "..." }
    ],
    "neverHit": ["promo-banner"]
  }
}
```
