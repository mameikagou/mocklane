# PLANNING-2 · Agent verification loop (wait / journey / report)

> Status: approved by owner ("你可以三个都做"). Supersedes nothing; extends the
> now-serving refactor in PLANNING.md. Write this first, implement boldly after.

## Purpose

Mocklane is an AI-driven mock. The agent configures rules and scenarios through
the CLI, then drives the page (via Tabbit or its own tooling) — but today it
has **no way to verify the interface layer actually fired**. It can only poll
`mocklane logs` and guess. This plan closes that loop with three commands:

| Command | One-line purpose |
|---|---|
| `wait` | Block until a matching hit arrives (assertion without polling) |
| `journey` | Execute a scenario-chain file step by step, one JSON line per step |
| `report` | Session summary: per-rule hit counts, never-hit rules, gate state |

Everything stays inside the existing AI-first contract: **each command prints
stable JSON, one object per line, no human formatting.**

## Scope

### 1. `mocklane wait` — hit assertion

```
mocklane wait [--rule <rule-id>] [--scenario <scenario-id>] [--timeout <ms>]
```

- Subscribes to daemon events over WebSocket with role `cli` and blocks until
  a hit event matches the filters (omitted filter = match anything).
- Success: `{"ok":true,"data":{"hit":{...}}}` — exit 0.
- Timeout: `{"ok":false,"error":{"code":"wait_timeout",...}}` — exit 1.
- Extension disconnects mid-wait: `{"ok":false,"error":{"code":"extension_disconnected",...}}`.
- Only observes **future** hits (assertion semantics: call `wait`, then act).
  Past hits are `logs`' job — documented, not implemented.
- Default timeout: 15000 ms. `--timeout 0` = wait forever is **not** supported;
  a forgotten wait must die.

**Backend change (daemon only, no extension change):** the daemon currently
broadcasts extension events to `role === 'dashboard'` clients only. Change the
broadcast target to dashboard **and** `cli` roles. The extension is untouched;
its event stream already exists.

### 2. `mocklane journey` — scenario chains

```
mocklane journey --file <journey.json>
```

Journey file format:

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

- Supported step actions: `apply` (with `file` or inline `rule`), `switch`,
  `enable`, `disable`, `global`, `wait`. All reuse the exact same CLI parsing
  paths as their standalone commands — journey is orchestration, not a second
  implementation.
- Prints **one JSON line per step**:
  `{"ok":true,"step":0,"action":"switch","data":{...}}`.
- Stops at the first failed step, prints that step's error line, exit 1.
- Final summary line: `{"ok":true,"journey":"checkout-timeout","steps":3}`.
- The seam for Tabbit: an agent runs `journey`, and between the lines it reads
  it can fire rendering checks with its own browser tooling. Mocklane never
  renders anything.

### 3. `mocklane report` — session summary

```
mocklane report
```

- Pure CLI composition over existing `status` + `list` RPCs. Zero backend change.
- Output shape:

```json
{
  "ok": true,
  "data": {
    "globalEnabled": true,
    "totalHits": 12,
    "rules": [
      { "id": "user-list", "endpoint": "/api/users", "enabled": true,
        "activeScenarioId": "ok", "hitCount": 12, "lastHitAt": "..." }
    ],
    "neverHit": ["promo-banner"]
  }
}
```

- `hitCount` / `lastHitAt` already exist on rules (persistent counters in the
  extension state) — report just reads them. `neverHit` surfaces wasted config.

## Explicitly out of scope

- Rendering / DOM / screenshot verification — that is the **Tabbit skill's**
  job (user's call: "这个不关你事").
- No `expect` assertions on response bodies inside journey steps beyond what
  `wait` already matches (rule + scenario). Deep body diffing is over-engineering
  for v1.
- No daemon persistence, no journey resume, no parallel journeys.

## Files that change

| File | Change |
|---|---|
| `src/daemon/server.mjs` | broadcast extension events to `cli` role too |
| `bin/mocklane.js` | add `wait` / `journey` / `report` commands + help text |
| `test/daemon.test.mjs` | test: cli role receives broadcast events |
| `test/cli.test.mjs` (new) | journey file validation + step→command mapping |
| `README.md` | new "Verify the loop" section, command table rows |
| `skills/browser-mock/SKILL.md` | document the three commands for agents |
| `skills/browser-mock/references/schema.md` | wait/journey/report output shapes |

## Acceptance

1. `bun run lint && bun run typecheck && bun run test && bun run build` all green.
2. One-line-JSON contract preserved on every new command and every step line.
3. A manual smoke: daemon + extension live, `wait` against a rule, trigger the
   hit from a page, confirm the JSON hit line; timeout path returns
   `wait_timeout`.
4. Journey file with a deliberate bad step exits 1 at that step with a stable
   error line.
