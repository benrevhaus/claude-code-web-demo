// ──────────────────────────────────────────────
// Alert Center — Notifications panel
// ──────────────────────────────────────────────
export default {
  name: 'AlertCenter',
  props: ['alerts'],
  template: `
    <div v-if="alerts">
      <div v-for="(alert, i) in alerts" :key="i"
           class="alert-item"
           :class="'alert-' + (alert.type === 'critical' ? 'critical' : alert.type === 'warning' ? 'warning' : 'info')">
        <span style="font-size:14px">{{ alert.type === 'critical' ? '🔴' : alert.type === 'warning' ? '🟡' : '🔵' }}</span>
        <div class="alert-msg">{{ alert.msg }}</div>
        <div class="alert-time">{{ alert.time }}</div>
      </div>
      <div v-if="!alerts.length" style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">
        No active alerts — all systems nominal
      </div>
    </div>
  `,
};
