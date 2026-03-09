# Slide Engine — Knowledge Document

## What This Is

A lightweight, reusable presentation engine for producing structured slide decks from plain TypeScript data.

There is no CMS, no drag-and-drop editor, no SaaS subscription. Content is defined as a typed array of slide objects. The engine turns that array into a full-screen, keyboard-navigable presentation that runs directly in a browser — no server, no install, no login.

---

## Why It Exists

Presentations are usually one-offs. A deck gets built for a meeting, delivered once, and either abandoned or slowly degraded as people paste over it for the next meeting. Rebuilding a similar deck from scratch each time is wasteful. Forking an old one introduces drift and inconsistency.

The deeper problem: most presentation tools optimize for visual freeform control, which makes decks hard to regenerate, automate, or reason about programmatically. You can't describe a slide in plain language and have a consistent result.

This engine exists to solve that. Content is separated from presentation. A slide is just a data object — a type, a title, some points. The engine handles all rendering. That separation means:

- Any slide can be regenerated from its description alone
- A new deck takes minutes, not hours
- An AI assistant can write, edit, or extend a deck by editing a TypeScript file
- Decks are version-controlled and diffable like code

---

## The Meta Point

The first deck built on this engine — *Building an AI-Native Organization* — argues that companies should encode knowledge into reusable, self-describing systems rather than rebuilding from scratch each time. It uses the metaphor of knowledge-encoded seeds: artifacts that contain not just the implementation, but the intent, reasoning, and context behind it.

The slide engine is itself a demonstration of that principle.

The deck was written and deployed while walking laps in a room for exercise, on a phone, in under an hour. It runs without infrastructure. It can be regenerated from its content files. It can be extended by anyone who can edit a TypeScript object. The governance — slide types, content rules, deck structure — lives in plain-language documents that any AI assistant can read and follow.

The medium matches the message.

---

## How It Works

```
src/
  engine/       — navigation, keyboard controls, deck loading, progress tracking
  layouts/      — one React component per slide type (hero, bullet, diagram, etc.)
  decks/
    {deck-name}/
      manifest.ts   — title, author, date, optional theme overrides
      slides.ts     — ordered array of typed slide objects
  theme.ts      — central design tokens

dist/           — built output; opens directly in any browser
```

Content lives entirely in `src/decks/{deck-name}/`. The engine and layouts never reference a specific deck. A new deck is just a new folder.

---

## Slide Types

Each slide has a `type` that maps to a layout component. Current types:

| Type | Purpose |
|------|---------|
| `hero` | Full-viewport opener or closer. Big statement. |
| `section` | Chapter divider with icon. |
| `bullet` | Heading + supporting points. The workhorse. |
| `comparison` | Two-column side-by-side. |
| `diagram` | Stacked layers with icons, labels, descriptions. |
| `proof-point` | Big metric or result with narrative context. |
| `icon-card` | Grid of cards with icon + label + description. |
| `quote` | Featured callout text. |
| `timeline` | Sequential items on a visual timeline. |

Full prop shapes are in `SLIDE_TYPES.md`.

---

## How to Create a New Deck

1. Copy `src/decks/_template/` to `src/decks/{your-deck-name}/`
2. Edit `manifest.ts` — set title, author, date
3. Edit `slides.ts` — add slide objects using the types above
4. Run `npm run build`
5. Open `dist/index.html?key=ve123!` in a browser

Or: describe the deck content to an AI assistant that has read this file and `SLIDE_TYPES.md`. It can write `slides.ts` directly.

---

## Access

The built output requires `?key=ve123!` in the URL to load. Without it the page is blank. This is a lightweight access control for sharing the file directly without exposing it to casual discovery.

---

## Design Constraints

- No build step required to view — `dist/` ships with the repo
- No external dependencies at runtime beyond the bundle
- No server, no backend, no accounts
- Keyboard navigation: arrow keys or spacebar to advance
- Designed for 1920×1080 presentation on a screen or projector
- Each slide is fully self-contained at that viewport

---

## Rebuild Instructions

If this repository is lost or needs to be recreated from scratch:

1. Read this file and `CLAUDE.md` to understand intent and architecture
2. Read `SLIDE_TYPES.md` to understand the content model
3. Scaffold a Vite + React + Tailwind project with `base: './'` in `vite.config.ts`
4. Implement the engine: deck loader, slide router, keyboard navigation
5. Implement one layout component per slide type
6. Implement the deck folder convention (`manifest.ts` + `slides.ts`)
7. Recreate any existing decks from their slide data
8. Build and verify `dist/index.html` opens directly in a browser

The architecture is simple enough to recreate in a single focused session.
