import { PANEL_ORDER } from './layout.config.js';
import { PANELS } from './panels.js';
import './style.css';

let currentRole = 'CS_AGENT';

function render() {
  const roleOptions = Object.keys(PANEL_ORDER)
    .map(role => `<option value="${role}" ${role === currentRole ? 'selected' : ''}>${role.replace('_', ' ')}</option>`)
    .join('');

  const panelIds = PANEL_ORDER[currentRole];

  const panelsHTML = panelIds.map(id => {
    const panel = PANELS[id];
    return `
      <section class="panel">
        <div class="panel-header">
          <span class="panel-icon">${panel.icon}</span>
          <span class="panel-title">${panel.title}</span>
        </div>
        <div class="panel-body">
          ${panel.render()}
        </div>
      </section>
    `;
  }).join('');

  const debugPills = panelIds.map(id => `<span class="debug-pill">${id}</span>`).join('<span class="debug-arrow">→</span>');

  document.getElementById('app').innerHTML = `
    <div class="console-root">
      <nav class="nav">
        <div class="nav-left">
          <span class="brand-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect width="20" height="20" rx="4" fill="#0969da"/>
              <path d="M5 10h10M10 5v10" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="brand-name">CS Console</span>
        </div>
        <div class="nav-center">
          <span class="breadcrumb">Support › Tickets › <strong>#4821</strong></span>
        </div>
        <div class="nav-right">
          <select id="role-select" class="role-select">${roleOptions}</select>
          <div class="nav-avatar">AR</div>
        </div>
      </nav>

      <main class="main-content">
        <div class="ticket-header">
          <div class="ticket-header-left">
            <div class="ticket-id-row">
              <span class="ticket-id">#4821</span>
              <span class="badge badge-open">Open</span>
              <span class="badge badge-high">High Priority</span>
            </div>
            <h1 class="ticket-title">Cannot export reports to CSV</h1>
            <div class="ticket-meta">
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0z"/></svg>
                Mar 4, 2026 · 09:41
              </span>
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z"/></svg>
                Alex Rivera
              </span>
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 2.5A.5.5 0 0 1 3 2h10a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-10zM1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-11zM5 8a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm0-2.5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm0 5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5z"/></svg>
                7 messages
              </span>
            </div>
          </div>
          <div class="ticket-header-right">
            <button class="btn btn-ghost">Merge</button>
            <button class="btn btn-ghost">Snooze</button>
            <button class="btn btn-primary">Resolve</button>
          </div>
        </div>

        <div class="panels-grid">
          ${panelsHTML}
        </div>

        <div class="debug-bar">
          <span class="debug-label">Layout order:</span>
          <div class="debug-pills">${debugPills}</div>
          <span class="debug-source">src/layout.config.js · role: ${currentRole}</span>
        </div>
      </main>
    </div>
  `;

  document.getElementById('role-select').addEventListener('change', (e) => {
    currentRole = e.target.value;
    render();
  });
}

render();
