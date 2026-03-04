# CS Console · support-console

A static support ticket console demonstrating live layout configuration via a single config file.

## File Structure

```
support-console/
├── .github/workflows/deploy.yml   # GitHub Pages CI/CD
├── src/
│   ├── layout.config.js           # ← THE KEY FILE: controls panel order per role
│   ├── panels.js                  # Panel content definitions
│   ├── main.js                    # App entry point, render logic
│   └── style.css                  # Internal-tool design system
├── index.html                     # Vite entry point
├── vite.config.js                 # Vite config (base: './', outDir: dist)
└── package.json                   # name: support-console, vite ^5
```

## One-Time GitHub Setup

```bash
# 1. Initialize and push main branch
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_ORG/support-console.git
git push -u origin main

# 2. Create the demo branch
git checkout -b demo
git push -u origin demo

# 3. Enable GitHub Pages
# Go to Settings → Pages → Source → GitHub Actions
```

## Local Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs to dist/
npm run preview   # preview the dist/ build
```

## PANEL_ORDER Config

`src/layout.config.js` is the only file that changes during the demo. It controls which panels appear and in what order for each role.

```js
export const PANEL_ORDER = {
  CS_AGENT: [
    'customer-info',
    'activity-feed',
    'notes',
  ],
  CS_MANAGER: [
    'notes',
    'customer-info',
    'activity-feed',
  ],
};
```

Valid panel IDs: `'customer-info'` | `'activity-feed'` | `'notes'`

## The Demo Change

**Problem:** Agents need to read the internal note before responding, but Notes is buried at the bottom.

**Fix:** Move `'notes'` above `'customer-info'` in CS_AGENT:

```js
CS_AGENT: [
  'notes',           // ← moved up
  'customer-info',
  'activity-feed',
],
```

This is a 1-line diff that completely reorders the workflow.

## Live Demo Script (6 Steps)

1. **Show current state** — Open the live site. Notes panel is buried at the bottom. The debug bar confirms: `customer-info → activity-feed → notes`.

2. **Open Claude Code Web** — Give it this instruction:
   > "Move 'notes' above 'customer-info' in CS_AGENT in layout.config.js."

3. **Show the 1-line diff** — Claude produces a minimal, readable diff. Only `layout.config.js` changes.

4. **Commit + push** — Claude commits with a descriptive message and pushes to the `demo` branch.

5. **Watch GitHub Actions (~45s)** — Navigate to the Actions tab. The build-and-deploy job runs automatically. Refresh the live site — Notes is now the first panel. The debug bar confirms: `notes → customer-info → activity-feed`.

6. **Explain governance** — The department head opens a PR with the config change. The architect reviews a trivial 1-line diff and merges. The team gets **speed** (Claude handles the edit) and **oversight** (PR review on a human-readable config file).
