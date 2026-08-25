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
      "body": "raw string; an omitted/null body normalizes to an empty string"
    }
  ],
  "activeScenarioId": "must point at one scenario"
}
```

`apply` also accepts one `scenario` object or top-level `status`, `headers`, and `body` as a convenience for a one-scenario rule. Header names are normalized to lowercase. Scenario IDs are de-duplicated with a numeric suffix when necessary.

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

Successful responses are `{ "ok": true, "data": ... }`. Errors use `{ "ok": false, "error": { "code": "...", "message": "..." } }`.
