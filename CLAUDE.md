# [project-name] — Claude instructions
## After every code change
- Bump `window.V` in `index.html`
- Append a short entry to the **Change Log** (below)
---
## Philosophy
This repository is a **scuttleable prototype**.
Optimize for fast iteration, clarity, and rebuildability. Avoid overengineering.
If uncertain, choose the simplest approach that still works end-to-end.
---
## What this is
[One paragraph: what the app does, who uses it, what problem it solves]
---
## Stack
- Vue 3 via CDN + importmap
- No build step
- Must work by opening `index.html` directly
- Persistence via `localStorage` only (for MVP)
---
## Golden Path (IMPORTANT)
To keep the code coherent and easy to regenerate, follow this structure:
- `index.html`
  Loads Vue via importmap, sets `window.V`, mounts the app, and contains only minimal HTML/CSS scaffolding.
- `src/app.js`
  Bootstraps the Vue app, wires the root component, and contains no business logic.
- `src/state.js`
  The **single source of truth** for all data access.
  This is the **only** file allowed to read/write `localStorage`.
  UI components must call functions from `state.js` rather than touching `localStorage` directly.
- `src/components/*.js`
  Small Vue components. Components should be as "pure" as practical:
  - accept props
  - emit events / call callbacks
  - avoid hidden side effects
  - do not access `localStorage` directly
If you need additional files, add them under `src/` and keep responsibilities clear.
---
## Data model
Describe all `localStorage` keys here. Each key must have:
- key name
- JSON shape (example object)
- meaning / lifecycle
- default value behavior
Example format:
- `app.items`
  - shape: `{ items: Array<{ id: string, title: string, done: boolean }> }`
  - meaning: main list of items
  - default: `{ items: [] }`
[Replace with your real keys]
---
## UI / Components to build
List the components that should exist and what they do.
- `RootApp` — overall layout, navigation, and top-level orchestration
- `ComponentA` — [what it does]
- `ComponentB` — [what it does]
---
## User flows
Write the 3–6 most important flows as bullets.
- Flow 1: [user does X → system does Y → user sees Z]
- Flow 2: ...
- Flow 3: ...
---
## Design constraints
- Keep UI clean and minimal (dashboard-like)
- Prefer readable spacing and simple typography
- Avoid excessive animations
- Keep layout consistent across screens
[Add colours, layout rules, any must-not-change constraints]
---
## Acceptance criteria
The MVP is "done" when:
- A non-technical user can open `index.html` and use the app successfully
- Data persists across refresh via `localStorage`
- The main flows work end-to-end
- The code follows the Golden Path structure
- `window.V` is updated and visible somewhere in the UI (footer is fine)
---
## Rebuild instructions
If this repository is lost or needs to be recreated:
1. Re-read this `CLAUDE.md`
2. Recreate `index.html` + the `src/` folder following the **Golden Path**
3. Implement the data model in `src/state.js`
4. Implement the listed components + user flows
5. Confirm acceptance criteria
---
## Change Log
- V0 — initial scaffold
- V1 — CTO Vision slide deck: 16-slide AI-Native Operational Advantage presentation
