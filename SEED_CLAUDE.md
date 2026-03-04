# [PROJECT-NAME] — Claude instructions

## CRITICAL RULE: bump `window.V` in `index.html` after every code change

The app uses browser module caching. Increment the `window.V` number after each edit session. Do not skip this step.

```html
<script>window.V = '2';</script>  <!-- bump this number every session -->
```

---

## What this is

[One paragraph: what the app does, who uses it, what problem it solves.]

---

## Stack

- Vue 3 CDN via importmap in `index.html` — no Node, no build step, no bundler
- Open `index.html` directly in a browser or serve with any static file server
- All modules are plain `.js` files using ES module syntax

## File structure

```
├── index.html              # importmap + window.V cache-buster
├── style.css               # CSS vars design system
└── src/
    ├── store.js            # Vue reactive + localStorage persistence
    ├── app.js              # Promise.all dynamic imports, Vue app entry
    └── components/
        ├── [ComponentA].js # [what it does]
        └── [ComponentB].js # [what it does]
```

## How the cache-busting works

`index.html` sets `window.V = 'N'`. Every dynamic import in `app.js` appends `?v=${v}` to bust the browser module cache. After any code change, increment the number. This is the only caching mechanism needed.

## Data model (localStorage)

| Key | Default | Description |
|-----|---------|-------------|
| `[prefix]_[field]` | `[default]` | [what it stores] |

To add new state in `src/store.js`:
1. Add a key to `KEYS`
2. Add a default to `DEFAULTS`
3. Add the field to the `store` reactive object
4. Add a `watch` call to persist it

## Components to build

- **[ComponentA]** — [what it renders, what store fields it reads/writes]
- **[ComponentB]** — [what it renders, what store fields it reads/writes]

## CSS design system

CSS custom properties in `style.css`:

```
--bg          page background
--surface     card/panel background
--border      dividers and outlines
--text        primary text
--text-muted  secondary/label text
--accent      primary action color
--nav-bg      dark nav bar (if applicable)
```

Adjust these values to match the project's color scheme. Do not use hardcoded colors in component templates — always reference a CSS var.

## Design constraints

- [Layout rule, e.g. "max-width: 960px centered, padding 20px"]
- [Persistence rule, e.g. "all user state persists across page refresh via localStorage"]
- [Visual rule, e.g. "internal-tool aesthetic — no gradients on data, no decorative shadows"]
- [Interaction rule, e.g. "no modals; all actions inline"]

## What NOT to do

- Do not add a build step, package.json, or bundler
- Do not use `<style>` tags inside component files — all CSS lives in `style.css`
- Do not hardcode colors — use CSS vars defined in `style.css`
- Do not forget to bump `window.V` in `index.html` after any change
