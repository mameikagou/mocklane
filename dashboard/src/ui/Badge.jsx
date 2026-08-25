export function Badge({ children, tone = 'muted' }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}
