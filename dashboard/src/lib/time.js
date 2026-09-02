/* Shared relative-time label ("5s ago" / "3m ago" / date). Lives in lib so
 * both the now-serving and rules features can use it — features never import
 * from each other. */
export function ago(iso) {
  const time = Date.parse(iso || '');
  if (!Number.isFinite(time)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(time).toLocaleDateString();
}
