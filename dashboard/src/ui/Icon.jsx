/* Mocklane dashboard · 内联线条图标（stroke 与状态同义，不加新库） */
export function Icon({ name, size = 16 }) {
  const paths = {
    pulse: <><path d="M3 12h3l2-7 4 14 2-7h4" /><path d="M21 12h-3" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-3L3 11M3 5v6h6M4 13a8 8 0 0 0 14.8 3L21 13m0 6v-6h-6" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>,
    moon: <path d="M20.5 14.2A7.8 7.8 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
    chevron: <path d="M9 6l6 6-6 6" />,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.pulse}</svg>;
}
