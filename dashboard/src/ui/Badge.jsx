// Class names must stay literal: the Tailwind purge scanner only sees strings
// that appear verbatim in source, so `badge-${tone}` would lose every tone.
const TONES = {
  success: 'badge-success',
  info: 'badge-info',
  warning: 'badge-warning',
  danger: 'badge-danger',
  muted: 'badge-muted',
};

export function Badge({ children, tone = 'muted' }) {
  return <span className={`badge ${TONES[tone] || TONES.muted}`}><span className="badge-dot" />{children}</span>;
}
