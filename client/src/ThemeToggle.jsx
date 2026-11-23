import { useEffect, useState } from 'react';

const STORAGE_THEME = 'scrum-poker:theme';

export function applyStoredTheme() {
  const saved = localStorage.getItem(STORAGE_THEME);
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_THEME, theme);
  }, [theme]);

  const dark = theme === 'dark';
  return (
    <button
      className="theme-toggle"
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M13 3l-1.1 1.1M4.1 11.9L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M13.5 10.5A6.5 6.5 0 0 1 5.5 2.5a6.5 6.5 0 1 0 8 8z" />
        </svg>
      )}
    </button>
  );
}
