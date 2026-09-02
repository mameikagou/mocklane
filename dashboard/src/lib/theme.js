/* Mocklane dashboard · 主题（深色为 arena 原生，浅色为日间映射；持久化到 localStorage） */
import { useEffect, useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('mocklane-theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('mocklane-theme', theme);
  }, [theme]);

  return [theme, () => setTheme((current) => (current === 'light' ? 'dark' : 'light'))];
}
