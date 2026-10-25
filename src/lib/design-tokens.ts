/**
 * RADAR Design Tokens
 *
 * Centralized design system. Components reference semantic token names
 * (e.g. --background, --primary, --foreground) rather than hardcoded colors.
 * The active theme + color mode determine the values applied to :root.
 *
 * Every theme ships an explicit light and dark palette so the light/dark/system
 * selector never produces an unreadable mix.
 */

export type ThemeId = 'midnight' | 'arctic' | 'aurora' | 'emergency';
export type ColorMode = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';

export interface ThemePalette {
  bg: string;
  sidebar: string;
  card: string;
  border: string;
  text: string;
  textHeading: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  cyan: string;
  mutedBg: string;
  mutedBorder: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  /** Default mode when the user has not overridden anything. */
  mode: ResolvedMode;
  palettes: Record<ResolvedMode, ThemePalette>;
}

// Base severity colors — consistent across every theme (never color alone).
export const SEVERITY_COLORS = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#FACC15',
  low: '#22C55E',
  info: '#3B82F6',
} as const;

export const severityLabel = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
} as const;

/** Severity is also encoded by shape/symbol so colour is never the only signal. */
export const SEVERITY_SYMBOL: Record<string, string> = {
  critical: '◆',
  high: '▲',
  medium: '●',
  low: '■',
  info: 'ℹ',
};

const midnight: ThemeDefinition = {
  id: 'midnight',
  label: 'Midnight Command',
  description: 'Dark emergency-control interface with calm blue accents',
  mode: 'dark',
  palettes: {
    dark: {
      bg: '#07111F',
      sidebar: '#0B1930',
      card: '#12243A',
      border: '#1E3A5F',
      text: '#F1F5F9',
      textHeading: '#FFFFFF',
      textMuted: '#9FB0C7',
      primary: '#3B82F6',
      primaryHover: '#60A5FA',
      cyan: '#22D3EE',
      mutedBg: '#0B1930',
      mutedBorder: '#1E3A5F',
    },
    light: {
      bg: '#F2F6FC',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      border: '#D8E3F2',
      text: '#13233A',
      textHeading: '#071426',
      textMuted: '#5A6B82',
      primary: '#155FD1',
      primaryHover: '#124FAC',
      cyan: '#0891B2',
      mutedBg: '#EAF1FA',
      mutedBorder: '#D8E3F2',
    },
  },
};

const arctic: ThemeDefinition = {
  id: 'arctic',
  label: 'Arctic Safety',
  description: 'Clean bright interface for school administration and inspection',
  mode: 'light',
  palettes: {
    light: {
      bg: '#F3F7FC',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      border: '#DCE5F0',
      text: '#14233B',
      textHeading: '#0F172A',
      textMuted: '#64748B',
      primary: '#1769E0',
      primaryHover: '#155BCC',
      cyan: '#06B6D4',
      mutedBg: '#F1F5F9',
      mutedBorder: '#DCE5F0',
    },
    dark: {
      bg: '#0A1424',
      sidebar: '#0E1B2E',
      card: '#122238',
      border: '#24374F',
      text: '#E9F1FB',
      textHeading: '#FFFFFF',
      textMuted: '#93A6BF',
      primary: '#3B82F6',
      primaryHover: '#60A5FA',
      cyan: '#22D3EE',
      mutedBg: '#0E1B2E',
      mutedBorder: '#24374F',
    },
  },
};

const aurora: ThemeDefinition = {
  id: 'aurora',
  label: 'Aurora',
  description: 'Futuristic visualisation theme for mapping and analytics',
  mode: 'dark',
  palettes: {
    dark: {
      bg: '#0B1020',
      sidebar: '#0F172A',
      card: '#151C32',
      border: '#26324A',
      text: '#F8FAFC',
      textHeading: '#FFFFFF',
      textMuted: '#A3B0C7',
      primary: '#8B5CF6',
      primaryHover: '#A78BFA',
      cyan: '#22D3EE',
      mutedBg: '#0F172A',
      mutedBorder: '#26324A',
    },
    light: {
      bg: '#F7F5FF',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      border: '#E4DDF7',
      text: '#1B1533',
      textHeading: '#120C26',
      textMuted: '#6B6285',
      primary: '#7C3AED',
      primaryHover: '#6D28D9',
      cyan: '#0891B2',
      mutedBg: '#F0ECFB',
      mutedBorder: '#E4DDF7',
    },
  },
};

const emergency: ThemeDefinition = {
  id: 'emergency',
  label: 'High-Visibility Emergency',
  description: 'Maximum-contrast controls for live incident command',
  mode: 'dark',
  palettes: {
    dark: {
      bg: '#0B1118',
      sidebar: '#0E1720',
      card: '#111A24',
      border: '#2A3946',
      text: '#F8FAFC',
      textHeading: '#FFFFFF',
      textMuted: '#A2B0BF',
      primary: '#EF4444',
      primaryHover: '#DC2626',
      cyan: '#22D3EE',
      mutedBg: '#0E1720',
      mutedBorder: '#2A3946',
    },
    light: {
      bg: '#FBF4F4',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      border: '#EFD9D9',
      text: '#2A1010',
      textHeading: '#1F0808',
      textMuted: '#7A5A5A',
      primary: '#C81E1E',
      primaryHover: '#A91616',
      cyan: '#0E7490',
      mutedBg: '#F8EDED',
      mutedBorder: '#EFD9D9',
    },
  },
};

export const THEMES: ThemeDefinition[] = [midnight, arctic, aurora, emergency];

export const getTheme = (id: ThemeId): ThemeDefinition => {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return midnight;
  return theme;
};

export const DEFAULT_THEME: ThemeId = 'midnight';
export const DEFAULT_ACCENT = '#3B82F6';
export const DEFAULT_MODE: ColorMode = 'dark';

export const STORAGE_KEY = 'radar:theme';
export const ACCENT_STORAGE_KEY = 'radar:accent';
export const MODE_STORAGE_KEY = 'radar:color-mode';

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const int = Number.parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mix two hex colours. `weight` is the share of `a` (0–1). */
export function mix(a: string, b: string, weight: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const to = (x: number, y: number) =>
    Math.round(x * weight + y * (1 - weight))
      .toString(16)
      .padStart(2, '0');
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

/**
 * Build the complete CSS variable set for a theme/mode/accent combination.
 * All component colours resolve through these variables.
 */
export function buildThemeVariables(
  theme: ThemeDefinition,
  mode: ResolvedMode,
  accent: string,
): Record<string, string> {
  const p = theme.palettes[mode];
  const isDark = mode === 'dark';
  const accentSoft = rgba(accent, isDark ? 0.16 : 0.1);
  const accentSoftHover = rgba(accent, isDark ? 0.24 : 0.16);

  return {
    // raw palette
    '--bg': p.bg,
    '--sidebar': p.sidebar,
    '--card': p.card,
    '--border': p.border,
    '--text': p.text,
    '--text-heading': p.textHeading,
    '--text-muted': p.textMuted,
    '--primary': p.primary,
    '--primary-hover': p.primaryHover,
    '--cyan': p.cyan,
    '--muted-bg': p.mutedBg,
    '--muted-border': p.mutedBorder,

    // semantic aliases consumed by Tailwind @theme
    '--background': p.bg,
    '--foreground': p.text,
    '--card-foreground': p.text,
    '--popover': p.card,
    '--popover-foreground': p.text,
    '--primary-foreground': '#FFFFFF',
    '--secondary': p.mutedBg,
    '--secondary-foreground': p.text,
    '--muted': p.mutedBg,
    '--muted-foreground': p.textMuted,
    '--sidebar-foreground': p.text,
    '--input': p.border,

    // accent (customisable)
    '--accent-solid': accent,
    '--accent': accentSoft,
    '--accent-hover': accentSoftHover,
    '--accent-foreground': accent,
    '--accent-border': rgba(accent, isDark ? 0.45 : 0.35),
    '--ring': accent,

    // status (constant hue family, tuned per mode for contrast)
    '--danger': '#EF4444',
    '--danger-soft': rgba('#EF4444', isDark ? 0.16 : 0.1),
    '--destructive': '#EF4444',
    '--destructive-foreground': '#FFFFFF',
    '--warning': isDark ? '#F59E0B' : '#B45309',
    '--warning-soft': rgba('#F59E0B', isDark ? 0.16 : 0.12),
    '--warning-foreground': isDark ? '#1F1300' : '#FFFFFF',
    '--success': isDark ? '#22C55E' : '#15803D',
    '--success-soft': rgba('#22C55E', isDark ? 0.16 : 0.12),
    '--info': isDark ? '#38BDF8' : '#0369A1',
    '--info-soft': rgba('#38BDF8', isDark ? 0.16 : 0.12),

    // layout
    '--radius': '0.75rem',
    '--shadow-color': isDark ? '0 0 0' : '15 23 42',
  };
}
