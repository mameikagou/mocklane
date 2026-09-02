<div align="center">

# Mocklane

**Deterministic browser API mocking, built for AI agents.**

Local-first Chrome MV3 extension + localhost relay + CLI.
Define endpoint rules once, switch response scenarios live, watch every hit — without leaving the page you're debugging.

[![License: MIT](https://img.shields.io/badge/license-MIT-amber)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/chrome-MV3-blue)](src/extension/manifest.json)
[![Runtime: Bun](https://img.shields.io/badge/runtime-bun-black)](package.json)

</div>

---

## Why Mocklane

Most mock tools force a choice: a GUI app that agents can't drive, or a code-level interceptor the browser never sees. Mocklane is designed around a third option — **the CLI is the product, the dashboard is the observer**:

| | |
|---|---|
| **AI-first contract** | Every command prints exactly one stable JSON object per line. No interactive prompts, no TTY formatting — an agent can parse everything. Ships with a ready-made agent skill ([`skills/browser-mock`](skills/browser-mock/SKILL.md)) so coding agents know how to drive it. |
| **Single source of truth** | Rules and hit logs live in the browser's IndexedDB, owned by the extension. The daemon is a **relay only** — it keeps no second copy, can't drift, and has nothing to corrupt. |
| **Fail-safe by default** | The global switch starts **off**. A rule never touches traffic until you explicitly enable it and flip the gate. State sync always sends the switch before the rules, so there's no enabled-race window. |

## Quick start

```bash
bun install --frozen-lockfile
bun run build
bun run bin/mocklane.js daemon --background   # prints {"pid": ..., "address": ...}
```

Then:

1. Load `dist/extension` in `chrome://extensions` → **Developer mode → Load unpacked**
2. Open the dashboard at <http://127.0.0.1:17321/>
3. Stop the daemon later with `kill <pid>`

> The extension intentionally connects only to `127.0.0.1:17321`. `daemon --port` is for isolated dashboard/CLI debugging — it does not move the extension connection.

## The agent loop

A complete mock cycle in six commands — exactly how an agent drives it:

```bash
mocklane status                                  # 1 · is the bridge up?
mocklane apply --file rule.json                  # 2 · create or replace a rule
mocklane enable user-list && mocklane global on  # 3 · arm one rule, then the gate
mocklane switch user-list empty                  # 4 · flip the live scenario
mocklane logs --limit 20                         # 5 · verify the hits
mocklane global off                              # 6 · leave the page clean
```

A rule is a complete request description: which requests it intercepts (`endpoint` + `matchType` + `method`), and which complete responses it can answer with — one scenario active at a time:

```json
{
  "id": "user-list",
  "endpoint": "/api/users",
  "matchType": "contains",
  "method": "GET",
  "enabled": true,
  "scenarios": [
    {
      "id": "ok",
      "name": "OK",
      "status": 200,
      "headers": { "content-type": "application/json" },
      "bodyFile": "payloads/user-list.json"
    },
    {
      "id": "empty",
      "name": "Empty",
      "status": 200,
      "headers": { "content-type": "application/json" },
      "body": "[]"
    }
  ],
  "activeScenarioId": "ok"
}
```

A real response payload lives in its own file: `bodyFile` is resolved relative to the rule file, so a rule ships as one rule file plus a `payloads/` folder — see the working pair in [`examples/`](examples/ai-store-launch-query.json) (`ai-store-launch-query.json` / `ai-store-launch-execute.json` + `payloads/`). Inline `body` stays available for tiny responses (an intentionally empty body is respected). `endpoint` matches by `contains` (default) or `regex`; `method` is case-insensitive, `*` is supported; statuses normalize to Fetch-compatible `200..599`. Full schema: [`skills/browser-mock/references/schema.md`](skills/browser-mock/references/schema.md).

### Command reference

| Command | Purpose |
|---|---|
| `daemon [--background] [--port]` | Run the relay; background form prints PID + address as JSON |
| `status` | Daemon, extension bridge, and global-switch state |
| `apply --json / --file` | Create or replace a rule |
| `list` · `scenarios <id>` | Inspect normalized rules |
| `enable` / `disable` / `remove <id>` | Rule lifecycle |
| `global on` / `off` | The single gate for all mocking |
| `switch <rule> <scenario>` | Change the live response without touching the page |
| `logs [--limit N]` | Recent hits: time, request, scenario, status |
| `match --url --method` | Dry-run the matcher against a URL |
| `request --url [--tab-id] [--native]` | Ask a page tab to fetch — see below |
| `wait [--rule] [--scenario] [--page] [--timeout]` | Block until a matching hit arrives — assertion without polling |
| `journey --file <journey.json> [--envs <envs.json>]` | Run a scenario chain, one JSON line per step |
| `report` | Session summary: per-rule hit counts, per-environment breakdown, never-hit rules, gate state |

`request` deserves a note: it asks **one** browser tab (active by default, or `--tab-id`) to perform a real page `fetch`, so an enabled rule can answer it and produce a normal hit log. `--native` bypasses the Mocklane wrapper and calls the original page fetch. Results are stable JSON with `status`, `headers`, raw `body`; network/CORS failures, a missing bridge, and timeouts return stable error codes; bodies cap at 2 MiB. It's a debugging aid — it deliberately refuses browser-internal and Mocklane dashboard tabs, and it cannot mutate a page's React state.

### Verify the loop

Configuring rules is only half the job — the agent also needs to know the page **actually consumed** them. Three commands close that loop at the interface layer (rendering/DOM checks belong to your browser-driving tooling, not Mocklane):

```bash
mocklane wait --rule checkout --scenario timeout --timeout 10000
# {"ok":true,"data":{"hit":{...}}}  — or a stable error: wait_timeout,
# extension_not_connected, extension_disconnected; exit code 1 on failure
```

`wait` only observes **future** hits: start the wait, then drive the page. `journey` chains steps from a JSON file — each step is one action (`apply`, `switch`, `enable`, `disable`, `global`, `wait`), prints one JSON line, and the run stops at the first failure:

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

`mocklane report` reads the persistent per-rule counters and answers the teardown question — did everything I configured actually fire? Per-rule `hitCount`/`lastHitAt`, `totalHits`, `neverHit` ids (wasted config), and gate state in one object.

### Environment scopes

A rule with `"page": "//staging.example."` only fires on pages whose own URL matches — the mock cannot leak onto other tabs or environments, and matching fails closed when the page is unknown. Anchor with `//` so `//qnh.shangou.st.` doesn't accidentally match `te[st.]` (or a swimlane host containing the test host as a substring). Name your environments once in `envs.json` (`{"test": {"page": "//qnh.shangou.test."}}`), then write `"env": "test"` in rule files — extend by adding keys, switch by re-applying with another name, compare via `wait --page` and `report`'s per-environment hit breakdown.

## Dashboard

<http://127.0.0.1:17321/> — a workbench status board over the live socket: gate state, bridge health, and a **now serving** view of which scenario each rule is currently answering with (per-rule hit counters included). Per-rule scenario switching stays one click away; the full hit log is one drawer away. Dark-first, amber-on-deep-space, tabular numerals everywhere. Read-only with respect to rules: the CLI stays the write path — the log stream itself is the agent's telemetry, consumed via `mocklane logs`.

## Architecture

```text
page MAIN world interceptor ──postMessage──> isolated bridge ──runtime message──> service worker
       (Fetch + XHR)                                  │                             │
       <──────────── state switch, then rules ────────┘                             │ IndexedDB
                                                                                     │
Chrome extension ───────────── WebSocket ───────────── localhost daemon ─── CLI / React dashboard
                                                         (relay only)
```

- The MAIN-world interceptor is intentionally tiny, uses no extension APIs, and is bundled from the same `src/core` matcher/interceptor modules covered by tests.
- The isolated bridge is the only page-facing extension script; it forwards hit events.
- The service worker owns IndexedDB, command mutations, and the daemon socket.
- Read-only commands never write or broadcast state; a hit updates the log and streams only that hit.

## Development

```bash
bun run lint        # style
bun run typecheck   # types
bun run test        # node --test
bun run build       # dist/extension + dist/dashboard + zip
bun run smoke       # end-to-end sanity
```

`bun run build` emits a loadable `dist/extension`, the bundled React/Rspack dashboard in `dist/dashboard`, and `dist/mocklane-extension.zip`. No `node_modules` ships in the extension artifact. The dashboard source is feature-organized (`app/` composition, `lib/` transport + store, `features/` per domain) — see [`dashboard/DESIGN.md`](dashboard/DESIGN.md).

## Limitations

Mocklane has a deliberately narrow scope. URL matching is `contains` or `regex` — nothing else. There is no declarativeNetRequest integration, no account system, no cloud storage, no telemetry, no DevTools panel. XHR response properties are best-effort (browsers expose some native properties as non-configurable); event order and the common text/JSON paths are preserved.

## License

MIT — see [LICENSE](LICENSE).
