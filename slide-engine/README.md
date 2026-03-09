# Slide Engine

A reusable, local-first presentation engine built with Vite + React + TypeScript.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173. You'll see the deck selector. Pick a deck and present.

## Creating a New Deck

```bash
npm run new-deck my-presentation
```

This copies the template into `src/decks/my-presentation/`. Edit the two files:

- **`manifest.ts`** — title, author, date, optional theme overrides
- **`slides.ts`** — your slide content as a typed array

That's it. The engine auto-discovers decks at build time.

## Presenting

- **Arrow keys** or **spacebar** — navigate slides
- **Escape** — return to deck selector
- **F** — toggle fullscreen
- **N** — toggle presenter notes panel
- **G** — go to slide number (type number then Enter)
- **Home/End** — first/last slide

## Slide Types

| Type | Purpose | Use For |
|------|---------|---------|
| `hero` | Big statement + subtitle | Opening slides, closers |
| `section` | Section divider | Chapter transitions |
| `bullet` | Heading + key points | Core content |
| `comparison` | Side-by-side | Before/after, either/or |
| `diagram` | Visual/layered graphic | Architecture, flows |
| `proof-point` | Metric + narrative | Results, experiments |
| `icon-card` | Grid of cards | Roles, categories |
| `quote` | Featured quote/callout | Key statements |
| `timeline` | Sequential events | History, roadmap |

See SLIDE_TYPES.md for full prop documentation.

## For AI-Assisted Editing

This repo is optimized for Claude Code. See CLAUDE.md for the protocol.
Key rule: Claude will always ask which deck you're working on before making changes.

## Architecture

See ARCH_MAP.md for the full system diagram and data flow.
