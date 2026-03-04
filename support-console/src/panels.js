export const PANELS = {
  'customer-info': {
    title: 'Customer Info',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z"/></svg>`,
    render() {
      return `
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
      `;
    },
  },

  'activity-feed': {
    title: 'Activity Feed',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0z"/></svg>`,
    render() {
      const events = [
        { time: '09:41', type: 'system',   text: 'Ticket created',                                         tag: 'System' },
        { time: '09:42', type: 'system',   text: 'Assigned to <strong>Alex Rivera</strong>',               tag: 'System' },
        { time: '10:05', type: 'customer', text: '"Can\'t export, button just spins"',                     tag: 'Customer' },
        { time: '10:18', type: 'agent',    text: 'Agent replied: investigating the export issue',          tag: 'Agent' },
        { time: '10:33', type: 'internal', text: 'Internal note added by Alex Rivera',                     tag: 'Internal' },
        { time: '10:45', type: 'customer', text: '"This is blocking my weekly exec report"',               tag: 'Customer' },
        { time: '11:02', type: 'system',   text: 'Priority escalated to <strong>High</strong>',            tag: 'System' },
      ];

      const items = events.map((ev, i) => `
        <div class="activity-event">
          <div class="dot-column">
            <div class="event-dot dot-${ev.type}"></div>
            ${i < events.length - 1 ? '<div class="event-line"></div>' : ''}
          </div>
          <div class="event-body">
            <div class="event-meta">
              <span class="event-time">${ev.time}</span>
              <span class="event-tag tag-${ev.type}">${ev.tag}</span>
            </div>
            <div class="event-text">${ev.text}</div>
          </div>
        </div>
      `).join('');

      return `<div class="activity-feed">${items}</div>`;
    },
  },

  'notes': {
    title: 'Internal Notes',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 3.75A.75.75 0 0 1 .75 3h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 3.75zm0 4A.75.75 0 0 1 .75 7h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 7.75zm0 4a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75z"/></svg>`,
    render() {
      return `
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
      `;
    },
  },
};
