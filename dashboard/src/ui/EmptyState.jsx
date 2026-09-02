import { Icon } from './Icon.jsx';

export function EmptyState({ title, body }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="pulse" size={20} /></div><strong>{title}</strong><span>{body}</span></div>;
}
