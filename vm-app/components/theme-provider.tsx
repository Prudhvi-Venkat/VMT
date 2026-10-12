'use client';

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {}
});

function getInitialTheme(defaultTheme: Theme, storageKey: string): Theme {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    const saved = localStorage.getItem(storageKey) as Theme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // fallback
  }
  return defaultTheme;
}

function subscribeSystemTheme(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function getSystemSnapshot() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getServerSnapshot() {
  return true;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'vm-theme'
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme(defaultTheme, storageKey));
  const systemDark = useSyncExternalStore(subscribeSystemTheme, getSystemSnapshot, getServerSnapshot);

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // storage disabled
    }
  }, [resolvedTheme, theme, storageKey]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const toggleTheme = () => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
