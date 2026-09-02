// Shared badge-tone semantics. Lives in lib/ so features stay decoupled:
// same method / same status class must read the same everywhere.
//
// Method colors follow the Swagger/OpenAPI convention (read = blue,
// create = green, modify = amber, destroy = red). Status colors reserve
// red for errors only — a normal 2xx must never look like a failure.
const METHOD_TONES = {
  GET: 'info',
  POST: 'success',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'danger',
};

export function methodTone(method) {
  return METHOD_TONES[String(method || '').toUpperCase()] || 'muted';
}

export function statusTone(status) {
  const code = Number(status);
  if (code >= 400) return 'danger';
  if (code >= 300) return 'info';
  return 'success';
}
