# CLAUDE.md — Slide Engine

## CRITICAL: Session Start Protocol

**EVERY session must begin by asking the user which deck they are working on.**
Run: `ls src/decks/` and present the list.
The user must explicitly confirm a deck name before ANY file modifications.
If no deck exists yet, confirm the new deck name before creating it.

**NEVER modify files outside the confirmed deck's directory unless the user explicitly asks to modify the engine itself.**

## Project Purpose

This is a reusable presentation engine. Content lives in `src/decks/{deck-name}/`.
The engine lives in `src/engine/` and `src/layouts/`.
These two concerns are strictly separated.

## Architecture Rules

1. **Decks are isolated.** Each deck is a folder under `src/decks/` containing:
   - `manifest.ts` — deck metadata (title, author, date, theme overrides)
   - `slides.ts` — ordered array of typed slide objects
   - Optional: `assets/` folder for deck-specific images

2. **Layouts are generic.** Layout components in `src/layouts/` accept typed props.
   They never import from a specific deck. They never contain hardcoded content.

3. **The engine is the router.** `src/engine/` handles navigation, deck selection,
   keyboard controls, progress tracking. It reads from the active deck's slides array
   and maps each slide's `type` to the correct layout component.

4. **Theme is centralized.** `src/theme.ts` defines the base design tokens.
   Decks can override tokens via `manifest.ts` theme overrides.

## Content Editing Workflow

To create a new deck:
1. Copy `src/decks/_template/` to `src/decks/{new-deck-name}/`
2. Edit `manifest.ts` with deck metadata
3. Edit `slides.ts` with slide content
4. The deck auto-registers via filesystem convention (dynamic import)

To modify an existing deck:
1. Confirm the deck name at session start
2. Only touch files inside `src/decks/{confirmed-deck}/`

## Slide Type Reference

See SLIDE_TYPES.md for the full type catalog with prop shapes and examples.

## File Modification Safety

- Engine files (`src/engine/*`, `src/layouts/*`): require explicit user confirmation
- Deck files (`src/decks/{name}/*`): only modify the session-confirmed deck
- Root config files: require explicit user confirmation
- Documentation files: can be updated when architecture changes

## Build & Deploy

- `npm run dev` — local dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build
- `npm run new-deck {name}` — scaffold a new deck from template

## Code Style

- TypeScript strict mode
- Functional components only, no classes
- Framer Motion for all animations
- Tailwind for all styling, no CSS modules or styled-components
- Each slide must be fully self-contained at 1920x1080 viewport
- No external API calls, no runtime dependencies beyond the bundle
