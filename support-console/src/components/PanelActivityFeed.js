export default {
  name: 'PanelActivityFeed',

  setup() {
    const events = [
      { time: '09:41', type: 'system',   text: 'Ticket created',                                      tag: 'System'   },
      { time: '09:42', type: 'system',   text: 'Assigned to <strong>Alex Rivera</strong>',            tag: 'System'   },
      { time: '10:05', type: 'customer', text: '"Can\'t export, button just spins"',                  tag: 'Customer' },
      { time: '10:18', type: 'agent',    text: 'Agent replied: investigating the export issue',       tag: 'Agent'    },
      { time: '10:33', type: 'internal', text: 'Internal note added by Alex Rivera',                  tag: 'Internal' },
      { time: '10:45', type: 'customer', text: '"This is blocking my weekly exec report"',            tag: 'Customer' },
      { time: '11:02', type: 'system',   text: 'Priority escalated to <strong>High</strong>',        tag: 'System'   },
    ];
    return { events };
  },

  template: `
    <section class="panel">
      <div class="panel-header">
        <span class="panel-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0z"/>
          </svg>
        </span>
        <span class="panel-title">Activity Feed</span>
      </div>
      <div class="panel-body">
        <div class="activity-feed">
          <div
            v-for="(ev, i) in events"
            :key="i"
            class="activity-event"
          >
            <div class="dot-column">
              <div class="event-dot" :class="'dot-' + ev.type"></div>
              <div v-if="i < events.length - 1" class="event-line"></div>
            </div>
            <div class="event-body">
              <div class="event-meta">
                <span class="event-time">{{ ev.time }}</span>
                <span class="event-tag" :class="'tag-' + ev.type">{{ ev.tag }}</span>
              </div>
              <div class="event-text" v-html="ev.text"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
};
