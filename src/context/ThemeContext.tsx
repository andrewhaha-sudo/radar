'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  buildThemeVariables,
  getTheme,
  THEMES,
  type ThemeDefinition,
  type ThemeId,
  type ColorMode,
  type ResolvedMode,
  DEFAULT_THEME,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  MODE_STORAGE_KEY,
} from '@/lib/design-tokens';

interface ThemeContextValue {
  theme: ThemeDefinition;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  accent: string;
  setAccent: (color: string) => void;
  resolvedMode: ResolvedMode;
  isDark: boolean;
  availableThemes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be unavailable (private mode) — ignore
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME);
  const [colorMode, setColorModeState] = useState<ColorMode>(DEFAULT_MODE);
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Hydrate stored preferences after mount. Values written before the RADAR
  // rename lived under hazardlink:* keys; read them once and rewrite under the
  // new keys so preferences survive the rebrand.
  useEffect(() => {
    const storedTheme =
      readStored<ThemeId | null>(STORAGE_KEY, null) ??
      readStored<ThemeId | null>('hazardlink:theme', null);
    const storedMode =
      readStored<ColorMode | null>(MODE_STORAGE_KEY, null) ??
      readStored<ColorMode | null>('hazardlink:color-mode', null);
    const storedAccent =
      readStored<string | null>(ACCENT_STORAGE_KEY, null) ??
      readStored<string | null>('hazardlink:accent', null);

    const theme = storedTheme && getTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
    const mode = storedMode ?? DEFAULT_MODE;
    const accent = storedAccent ?? DEFAULT_ACCENT;

    setThemeIdState(theme);
    setColorModeState(mode);
    setAccentState(accent);
    writeStored(STORAGE_KEY, theme);
    writeStored(MODE_STORAGE_KEY, mode);
    writeStored(ACCENT_STORAGE_KEY, accent);
  }, []);

  // Track OS preference changes while in "system" mode.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolvedMode: ResolvedMode = useMemo(() => {
    if (colorMode === 'system') return systemDark ? 'dark' : 'light';
    return colorMode;
  }, [colorMode, systemDark]);

  const isDark = resolvedMode === 'dark';
  const theme = useMemo(() => getTheme(themeId), [themeId]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    writeStored(STORAGE_KEY, id);
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    writeStored(MODE_STORAGE_KEY, mode);
  }, []);

  const setAccent = useCallback((color: string) => {
    setAccentState(color);
    writeStored(ACCENT_STORAGE_KEY, color);
  }, []);

  // Apply all CSS variables whenever theme/mode/accent changes.
  useEffect(() => {
    const root = document.documentElement;
    const vars = buildThemeVariables(theme, resolvedMode, accent);

    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-mode', resolvedMode);
    root.classList.toggle('dark', resolvedMode === 'dark');
    root.classList.toggle('light', resolvedMode === 'light');
    root.style.colorScheme = resolvedMode;

    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [theme, resolvedMode, accent]);

  const ctxValue = useMemo(
    () => ({
      theme,
      themeId,
      setTheme,
      colorMode,
      setColorMode,
      accent,
      setAccent,
      resolvedMode,
      isDark,
      availableThemes: THEMES,
    }),
    [theme, themeId, setTheme, colorMode, setColorMode, accent, setAccent, resolvedMode, isDark],
  );

  return <ThemeContext.Provider value={ctxValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
