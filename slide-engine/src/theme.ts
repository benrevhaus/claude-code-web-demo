import type { ThemeTokens } from './engine/types'

export const defaultTheme: ThemeTokens = {
  colors: {
    bg: '#0a0a0f',
    fg: '#f0f0f5',
    accent: '#6366f1',
    muted: '#9ca3af',
    subtle: '#1e1e2e',
    border: '#2a2a3e',
    cardBg: '#13131f',
  },
  fonts: {
    heading: '"Inter", "SF Pro Display", system-ui, sans-serif',
    body: '"Inter", "SF Pro Text", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  spacing: {
    slidePadding: '5rem',
    contentMaxWidth: '1400px',
  },
  animation: {
    duration: 0.4,
    easing: 'easeInOut',
  },
}

export function mergeTheme(
  base: ThemeTokens,
  overrides?: Partial<ThemeTokens> & { colors?: Partial<typeof base.colors> }
): ThemeTokens {
  if (!overrides) return base
  return {
    ...base,
    ...overrides,
    colors: {
      ...base.colors,
      ...(overrides.colors ?? {}),
    },
    fonts: {
      ...base.fonts,
      ...(overrides.fonts ?? {}),
    },
    spacing: {
      ...base.spacing,
      ...(overrides.spacing ?? {}),
    },
    animation: {
      ...base.animation,
      ...(overrides.animation ?? {}),
    },
  }
}

export function themeToVars(theme: ThemeTokens): Record<string, string> {
  return {
    '--color-bg': theme.colors.bg,
    '--color-fg': theme.colors.fg,
    '--color-accent': theme.colors.accent,
    '--color-muted': theme.colors.muted,
    '--color-subtle': theme.colors.subtle,
    '--color-border': theme.colors.border,
    '--color-card-bg': theme.colors.cardBg,
    '--font-heading': theme.fonts.heading,
    '--font-body': theme.fonts.body,
    '--font-mono': theme.fonts.mono,
    '--slide-padding': theme.spacing.slidePadding,
    '--content-max-width': theme.spacing.contentMaxWidth,
  }
}
