import { applyStateCommand } from './state.mjs';
import { normalizeState } from './schema.mjs';

// Queries must never write IndexedDB or broadcast a state event. Keeping this
// list next to the runner makes the persistence boundary explicit and easy to
// exercise without booting a Chrome service worker.
export const READ_COMMANDS = new Set(['status', 'list', 'scenarios', 'logs', 'match']);

function commandName(command = {}) {
  return String(command.name || command.command || '').toLowerCase();
}

function comparableState(state) {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    rules: normalized.rules.map(({ createdAt, updatedAt, ...rule }) => ({
      ...rule,
      scenarios: rule.scenarios.map((scenario) => ({ ...scenario })),
    })),
  };
}

export function hasMeaningfulChange(before, after) {
  return JSON.stringify(comparableState(before)) !== JSON.stringify(comparableState(after));
}

/**
 * Execute one extension command against a storage adapter. Query commands
 * return the normalized result without touching writeState/onState. Mutation
 * commands persist and notify only when the semantic state changed.
 */
export async function executeStoredCommand(command, { readState, writeState, onState } = {}) {
  if (typeof readState !== 'function' || typeof writeState !== 'function') {
    throw new TypeError('readState and writeState are required');
  }
  const before = normalizeState(await readState());
  const result = applyStateCommand(before, command);
  if (!result.ok || READ_COMMANDS.has(commandName(command))) return result;
  const after = normalizeState(result.state || before);
  if (!hasMeaningfulChange(before, after)) return result;
  await writeState(after);
  await onState?.(after);
  return result;
}
