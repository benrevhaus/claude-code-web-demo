// ─── Slide Types ──────────────────────────────────────────────────────────────

export type SlideType =
  | 'hero'
  | 'section'
  | 'bullet'
  | 'comparison'
  | 'diagram'
  | 'proof-point'
  | 'icon-card'
  | 'quote'
  | 'timeline'
  | 'seed-doc'

// ─── Per-Type Prop Interfaces ─────────────────────────────────────────────────

export interface HeroSlideProps {
  type: 'hero'
  title: string
  subtitle?: string
  accent?: string
  notes?: string
}

export interface SectionSlideProps {
  type: 'section'
  title: string
  subtitle?: string
  icon?: string
  notes?: string
}

export interface BulletSlideProps {
  type: 'bullet'
  title: string
  subtitle?: string
  points: string[]
  notes?: string
}

export interface ComparisonSlideProps {
  type: 'comparison'
  title: string
  left: { heading: string; points: string[] }
  right: { heading: string; points: string[] }
  notes?: string
}

export interface DiagramLayer {
  icon?: string
  label: string
  description?: string
  color?: string
}

export interface DiagramSlideProps {
  type: 'diagram'
  title?: string
  layers: DiagramLayer[]
  notes?: string
}

export interface ProofPointSlideProps {
  type: 'proof-point'
  title: string
  metric: string
  metricLabel: string
  narrative: string
  comparison?: string
  notes?: string
}

export interface IconCard {
  icon: string
  label: string
  description: string
}

export interface IconCardSlideProps {
  type: 'icon-card'
  title?: string
  cards: IconCard[]
  columns?: 2 | 3 | 4
  notes?: string
}

export interface QuoteSlideProps {
  type: 'quote'
  text: string
  attribution?: string
  notes?: string
}

export interface TimelineItem {
  label: string
  description?: string
  icon?: string
}

export interface TimelineSlideProps {
  type: 'timeline'
  title?: string
  items: TimelineItem[]
  notes?: string
}

export interface SeedDocGroup {
  label: string
  color?: string
  sections: string[]
}

export interface SeedDocSlideProps {
  type: 'seed-doc'
  title?: string
  filename: string
  description?: string
  groups: SeedDocGroup[]
  highlight?: string[]
  notes?: string
}

// ─── Discriminated Union ──────────────────────────────────────────────────────

export type Slide =
  | HeroSlideProps
  | SectionSlideProps
  | BulletSlideProps
  | ComparisonSlideProps
  | DiagramSlideProps
  | ProofPointSlideProps
  | IconCardSlideProps
  | QuoteSlideProps
  | TimelineSlideProps
  | SeedDocSlideProps

// ─── Theme Tokens ─────────────────────────────────────────────────────────────

export interface ThemeColors {
  bg: string
  fg: string
  accent: string
  muted: string
  subtle: string
  border: string
  cardBg: string
}

export interface ThemeFonts {
  heading: string
  body: string
  mono: string
}

export interface ThemeSpacing {
  slidePadding: string
  contentMaxWidth: string
}

export interface ThemeAnimation {
  duration: number
  easing: string
}

export interface ThemeTokens {
  colors: ThemeColors
  fonts: ThemeFonts
  spacing: ThemeSpacing
  animation: ThemeAnimation
}

// ─── Deck Manifest ────────────────────────────────────────────────────────────

export interface DeckManifest {
  id: string
  title: string
  author?: string
  date?: string
  description?: string
  theme?: Partial<ThemeTokens> & {
    colors?: Partial<ThemeColors>
  }
}

// ─── Loaded Deck ──────────────────────────────────────────────────────────────

export interface LoadedDeck {
  manifest: DeckManifest
  slides: Slide[]
  slideCount: number
}
