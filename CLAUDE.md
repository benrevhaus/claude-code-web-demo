# claude-code-web-demo — Claude instructions

## CRITICAL RULE: bump `window.V` in `support-console/index.html` after every code change

The app uses browser module caching. The only way to guarantee fresh code runs is to increment the `window.V` number after each edit session. Do not skip this step.

```html
<script>window.V = '4';</script>  <!-- was 3 → bump to 4 -->
```

---

## What this repo is

A demo project for Claude Code Web. It contains a no-build Vue 3 support-console app that demonstrates live layout configuration via a single config file (`layout.config.js`). Used to show how Claude Code Web can make a minimal, auditable code change that deploys to production in under 60 seconds.

---

## Stack

- **Vue 3 CDN** via importmap in `index.html` — no Node, no build step, no bundler
- Open `support-console/index.html` directly in a browser or serve with any static file server
- All modules are plain `.js` files using ES module syntax

## File structure

```
support-console/
├── index.html              # importmap + window.V cache-buster
├── style.css               # CSS vars design system
└── src/
    ├── layout.config.js    # ← THE DEMO FILE: controls panel order per role
    ├── store.js            # Vue reactive + localStorage persistence
    ├── app.js              # Promise.all dynamic imports, Vue app entry
    └── components/
        ├── NavBar.js
        ├── TicketHeader.js
        ├── PanelCustomerInfo.js
        ├── PanelActivityFeed.js
        ├── PanelNotes.js
        └── DebugBar.js
```

## How the cache-busting works

`index.html` sets `window.V = 'N'`. Every dynamic import in `app.js` appends `?v=${v}` to bust the browser module cache. After any code change, increment the number in `index.html`. This is the only caching mechanism — no service workers, no HTTP headers to configure.

## The demo change

`src/layout.config.js` is the only file that changes during the live demo. Moving `'notes'` to the top of the `CS_AGENT` array reorders the workflow for agents.

Valid panel IDs: `'customer-info'` | `'activity-feed'` | `'notes'`

The demo narrative: agents need to read the internal note before responding, but Notes is buried at the bottom. A 1-line config change fixes it. A department head can open a PR with this diff — the architect reviews a human-readable array reorder and merges. Speed (Claude edits) + oversight (PR on a config file).

## Store pattern

`src/store.js` uses Vue `reactive` + `watch` to persist state to localStorage. Keys are prefixed `sc_`. To add new state:
1. Add a key to `KEYS`
2. Add a default to `DEFAULTS`
3. Add the field to the `store` reactive object
4. Add a `watch` call to persist it

## CSS design system

All colors are CSS custom properties defined at the top of `style.css`:

```
--bg          page background
--surface     card/panel background
--border      dividers and outlines
--text        primary text
--text-muted  secondary/label text
--accent      primary blue (#0969da)
--nav-bg      dark nav bar (#1e2330)
```

Do not use hardcoded colors anywhere. Always reference a CSS var.

---

## Using this as a skeleton for future MVPs

This repo is the reusable pattern. For every new no-build Vue 3 MVP:

### One-time GitHub setup
Mark this repo as a **Template repository**: GitHub → Settings → check "Template repository".

### Per-project workflow
1. **Use this template** on GitHub → create a new repo
2. Clone and open in Claude Code Web
3. **Replace CLAUDE.md** using `SEED_CLAUDE.md` as your starting point — fill in the project-specific sections before writing any code
4. First prompt to Claude: `"Build this according to CLAUDE.md"`
5. Iterate — Claude bumps `window.V` each round

### What to keep in every new skeleton
| File | What to do |
|------|-----------|
| `index.html` | Keep the importmap + `window.V` pattern. Change the `<title>` only. |
| `style.css` | Keep the CSS vars design system. Adjust color values to match new project. |
| `src/store.js` | Keep the reactive + localStorage pattern. Replace keys, defaults, and fields. |
| `src/app.js` | Keep the `Promise.all` dynamic import pattern. Replace the component list. |
| `src/components/` | Delete existing components. Add new ones. |

### What to replace or remove
- `src/layout.config.js` — specific to this demo; remove or replace with your own config pattern
- `src/components/*.js` — replace with your app's components
- `README.md` — describe the new project

### The highest-leverage file is CLAUDE.md
Claude reads it before anything else. A clear CLAUDE.md means your first prompt can be high-level and Claude won't ask clarifying questions. **Copy `SEED_CLAUDE.md` to the new repo as `CLAUDE.md` and fill in the blanks before you write a single line of code.**
