# Architecture Map

## System Diagram

```
┌─────────────────────────────────────────────────────┐
│                     App.tsx                          │
│  ┌───────────────┐    ┌──────────────────────────┐  │
│  │ DeckSelector   │───▶│ SlideRouter               │  │
│  │ (home screen)  │    │  ├─ KeyboardNav           │  │
│  └───────────────┘    │  ├─ ProgressBar            │  │
│                        │  ├─ PresenterNotes         │  │
│                        │  └─ ActiveSlideLayout      │  │
│                        └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Data Flow

```
src/decks/{name}/slides.ts    (content: typed slide objects)
        │
        ▼
src/engine/SlideRouter.tsx     (reads slide array, tracks index)
        │
        ▼
slide.type → Layout mapping    (maps "hero" → HeroSlide, etc.)
        │
        ▼
src/layouts/{Type}Slide.tsx    (renders props into styled JSX)
        │
        ▼
src/theme.ts                   (provides design tokens)
```

## Deck Discovery

Decks are auto-discovered using Vite's `import.meta.glob`:

```ts
const deckModules = import.meta.glob('./decks/*/manifest.ts')
```

This means adding a folder to `src/decks/` is all that's needed to register a deck.

## Slide Type Resolution

SlideRouter uses a static map:

```ts
const LAYOUT_MAP: Record<SlideType, ComponentType<any>> = {
  hero: HeroSlide,
  section: SectionSlide,
  bullet: BulletSlide,
  comparison: ComparisonSlide,
  diagram: DiagramSlide,
  'proof-point': ProofPointSlide,
  'icon-card': IconCardSlide,
  quote: QuoteSlide,
  timeline: TimelineSlide,
}
```

No dynamic imports for layouts. They're all in the bundle. This keeps navigation instant.

## Theme System

```ts
// theme.ts — base tokens
{
  colors: { bg, fg, accent, muted, ... },
  fonts: { heading, body, mono },
  spacing: { slide padding, content max-width },
  animation: { duration, easing },
}

// manifest.ts — deck overrides (partial)
{
  theme: {
    colors: { accent: '#custom' }
  }
}
```

Tokens are merged at runtime: base ← deck overrides.
Layouts consume tokens via CSS custom properties set on the slide container.

## File Ownership

| Path | Owner | Modify When |
|------|-------|-------------|
| `src/engine/*` | Engine | Adding features to the presentation framework |
| `src/layouts/*` | Engine | Adding or fixing slide types |
| `src/decks/{name}/*` | Deck author | Creating/editing a specific presentation |
| `src/theme.ts` | Engine | Changing the base design system |
| `CLAUDE.md` | Maintainer | Changing AI collaboration protocol |
