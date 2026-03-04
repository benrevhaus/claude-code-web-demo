# support-console — Claude instructions

## After every code change: bump the cache-bust version

`index.html` contains a single version stamp that busts all ES module caches:

```html
<script>window.V = '3';</script>
```

**Rule: increment this number every time any `.js` or `.css` file is modified.**

Without this, browsers serve stale cached modules and changes are invisible.

### How to find and bump it

The line is near the bottom of the `<head>` in `index.html`:

```
support-console/index.html  →  <script>window.V = 'N';</script>
```

Change `N` to `N+1`. That's it — all module URLs across the entire app
change automatically because every import uses `?v=${window.V}`.

## Project overview

Static app, no build step. Open `index.html` directly in a browser or
serve with any static file server.

```
support-console/
├── index.html              ← Versionstamp lives here (window.V)
├── style.css
└── src/
    ├── layout.config.js    ← THE demo file: controls panel order per role
    ├── store.js            ← Reactive localStorage store (role, notes, ticketStatus)
    ├── app.js              ← createApp, dynamic imports, panel routing
    └── components/
        ├── NavBar.js
        ├── TicketHeader.js
        ├── PanelCustomerInfo.js
        ├── PanelActivityFeed.js
        ├── PanelNotes.js
        └── DebugBar.js     ← Shows layout order + Reset Sandbox button
```

## localStorage keys

| Key               | Type     | Default      | What it stores          |
|-------------------|----------|--------------|-------------------------|
| `sc_role`         | string   | `'CS_AGENT'` | Selected role           |
| `sc_notes`        | object[] | `[]`         | Posted internal notes   |
| `sc_ticket_status`| string   | `'open'`     | open / snoozed / resolved |

The Reset Sandbox button in the debug bar clears all three keys.

## Panel IDs

Valid values for `layout.config.js`: `'customer-info'` `'activity-feed'` `'notes'`
