(function(){const a=document.createElement("link").relList;if(a&&a.supports&&a.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))n(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const c of t.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&n(c)}).observe(document,{childList:!0,subtree:!0});function s(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function n(e){if(e.ep)return;e.ep=!0;const t=s(e);fetch(e.href,t)}})();const l={CS_AGENT:["customer-info","activity-feed","notes"],CS_MANAGER:["notes","customer-info","activity-feed"]},d={"customer-info":{title:"Customer Info",icon:'<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z"/></svg>',render(){return`
        <div class="customer-info-layout">
          <div class="customer-avatar">SC</div>
          <div class="customer-details">
            <div class="customer-name-row">
              <span class="customer-name">Sarah Chen</span>
              <span class="badge badge-pro">Pro</span>
            </div>
            <div class="customer-email">sarah.chen@acmecorp.com</div>
            <div class="info-grid">
              <span class="info-label">Account ID</span>
              <span class="info-value">ACC-8821</span>
              <span class="info-label">Member since</span>
              <span class="info-value">March 2022</span>
              <span class="info-label">Tickets (90d)</span>
              <span class="info-value">3</span>
              <span class="info-label">Health score</span>
              <span class="info-value health-score">92 / 100</span>
            </div>
          </div>
        </div>
      `}},"activity-feed":{title:"Activity Feed",icon:'<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0z"/></svg>',render(){const i=[{time:"09:41",type:"system",text:"Ticket created",tag:"System"},{time:"09:42",type:"system",text:"Assigned to <strong>Alex Rivera</strong>",tag:"System"},{time:"10:05",type:"customer",text:`"Can't export, button just spins"`,tag:"Customer"},{time:"10:18",type:"agent",text:"Agent replied: investigating the export issue",tag:"Agent"},{time:"10:33",type:"internal",text:"Internal note added by Alex Rivera",tag:"Internal"},{time:"10:45",type:"customer",text:'"This is blocking my weekly exec report"',tag:"Customer"},{time:"11:02",type:"system",text:"Priority escalated to <strong>High</strong>",tag:"System"}];return`<div class="activity-feed">${i.map((s,n)=>`
        <div class="activity-event">
          <div class="dot-column">
            <div class="event-dot dot-${s.type}"></div>
            ${n<i.length-1?'<div class="event-line"></div>':""}
          </div>
          <div class="event-body">
            <div class="event-meta">
              <span class="event-time">${s.time}</span>
              <span class="event-tag tag-${s.type}">${s.tag}</span>
            </div>
            <div class="event-text">${s.text}</div>
          </div>
        </div>
      `).join("")}</div>`}},notes:{title:"Internal Notes",icon:'<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 3.75A.75.75 0 0 1 .75 3h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 3.75zm0 4A.75.75 0 0 1 .75 7h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 7.75zm0 4a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75z"/></svg>',render(){return`
        <div class="notes-section">
          <div class="existing-note">
            <div class="note-meta">
              <span class="note-author">Alex Rivera</span>
              <span class="note-time">10:33 AM</span>
            </div>
            <div class="note-text">Export bug confirmed — affects Pro accounts after Feb 15. Engineering tracking as BUG-2241. ETA ~24h. Offer 1-month credit.</div>
          </div>
          <div class="note-composer">
            <textarea class="note-textarea" placeholder="Add an internal note…" rows="3"></textarea>
            <div class="composer-actions">
              <button class="btn btn-primary">Post</button>
              <button class="btn btn-ghost">Discard</button>
            </div>
          </div>
        </div>
      `}}};let o="CS_AGENT";function r(){const i=Object.keys(l).map(e=>`<option value="${e}" ${e===o?"selected":""}>${e.replace("_"," ")}</option>`).join(""),a=l[o],s=a.map(e=>{const t=d[e];return`
      <section class="panel">
        <div class="panel-header">
          <span class="panel-icon">${t.icon}</span>
          <span class="panel-title">${t.title}</span>
        </div>
        <div class="panel-body">
          ${t.render()}
        </div>
      </section>
    `}).join(""),n=a.map(e=>`<span class="debug-pill">${e}</span>`).join('<span class="debug-arrow">→</span>');document.getElementById("app").innerHTML=`
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
          <select id="role-select" class="role-select">${i}</select>
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
          ${s}
        </div>

        <div class="debug-bar">
          <span class="debug-label">Layout order:</span>
          <div class="debug-pills">${n}</div>
          <span class="debug-source">src/layout.config.js · role: ${o}</span>
        </div>
      </main>
    </div>
  `,document.getElementById("role-select").addEventListener("change",e=>{o=e.target.value,r()})}r();
