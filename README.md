# Mocklane

Mocklane is a small, local-first browser API mock tool. It lets an AI agent or a developer define endpoint rules from a stable CLI, switch response scenarios, and see hit logs while working in Chrome or Tabbit.

The extension owns the data in IndexedDB. The localhost daemon only relays WebSocket messages between the extension, CLI, and dashboard; it deliberately keeps no second copy of rules or logs.

## Quick start

```bash
npm install
npm run build
node bin/mocklane.js daemon --background
```

Load `dist/extension` in `chrome://extensions` with **Developer mode → Load unpacked**. Open the dashboard at <http://127.0.0.1:17321/>. The default global switch is off, so a rule never changes traffic until it is explicitly enabled.

The background form prints a stable JSON object containing the daemon PID and address. Stop it with `kill <pid>` when finished. The extension intentionally connects only to `127.0.0.1:17321`; `--port` is for dashboard/CLI debugging and does not move the extension connection:

```bash
node bin/mocklane.js daemon --port 17322
```

Use `node bin/mocklane.js daemon` when running in the foreground. Keep the default `17321` for a connected extension.

## CLI examples

Every command prints one JSON object on one line. The examples below assume the daemon and extension are connected.

```bash
# Create one endpoint with two response scenarios.
node bin/mocklane.js apply --json '{
  "id": "user-list",
  "endpoint": "/api/users",
  "matchType": "contains",
  "method": "GET",
  "scenarios": [
    {"id":"ok","name":"OK","status":200,"headers":{"content-type":"application/json"},"body":"[{\"id\":1}]"},
    {"id":"empty","name":"Empty","status":200,"headers":{"content-type":"application/json"},"body":"[]"}
  ],
  "activeScenarioId": "ok"
}'

node bin/mocklane.js global on
node bin/mocklane.js list
node bin/mocklane.js scenarios user-list
node bin/mocklane.js switch user-list empty
node bin/mocklane.js logs --limit 20
node bin/mocklane.js match --url 'https://example.test/api/users' --method GET
node bin/mocklane.js disable user-list
node bin/mocklane.js remove user-list
```

Useful commands are `daemon`, `status`, `list`, `apply`, `scenarios`, `switch`, `enable`, `disable`, `remove`, `global`, `logs`, and `match`. Run `node bin/mocklane.js --help` for the complete argument shape.

## Rule format

```json
{
  "id": "checkout-error",
  "endpoint": "/api/checkout",
  "matchType": "contains",
  "method": "POST",
  "enabled": true,
  "scenarios": [
    {
      "id": "timeout",
      "name": "Timeout",
      "status": 504,
      "headers": {"content-type": "application/json"},
      "body": "{\"message\":\"upstream timeout\"}"
    }
  ],
  "activeScenarioId": "timeout"
}
```

`endpoint` is matched with either `contains` (the default) or `regex`. `method` defaults to `GET` and is compared case-insensitively after normalization. A rule has one or more scenarios and exactly one active scenario. Response bodies stay raw strings, including an intentionally empty body. Status values normalize to Fetch-compatible `200..599`.

The full schema and command payloads are in [`skills/browser-mock/references/schema.md`](skills/browser-mock/references/schema.md).

## Architecture

```text
page MAIN world interceptor ──postMessage──> isolated bridge ──runtime message──> service worker
       (Fetch + XHR)                                  │                             │
       <──────────── state switch, then rules ────────┘                             │ IndexedDB
                                                                                     │
Chrome extension ───────────── WebSocket ───────────── localhost daemon ─── CLI / React dashboard
                                                         (relay only)
```

The MAIN-world script is intentionally tiny and does not use extension APIs. It is bundled from the same `src/core` matcher/interceptor modules used by tests. The isolated bridge is the only page-facing extension script and forwards hit events. The service worker handles browser IndexedDB, command mutations, and the daemon socket. State sync always sends the global switch before the rules to avoid a short enabled race. Read-only commands never write or broadcast state; hit events update the log and stream only the hit event.

## Development and verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke
```

`npm run build` emits a loadable `dist/extension` directory, a bundled React/Rspack dashboard in `dist/dashboard`, and `dist/mocklane-extension.zip`. No `node_modules` directory is part of the extension artifact.

This repository is distributed under the MIT License; see [`LICENSE`](LICENSE).

## Limitations

Mocklane intentionally has a narrow scope: URL matching is only `contains` or `regex`; there is no declarativeNetRequest integration, account system, cloud storage, telemetry, or DevTools UI. XHR response properties are best-effort because browsers expose some native properties as non-configurable; event order and the common text/JSON response paths are preserved.
