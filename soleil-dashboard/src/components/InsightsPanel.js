// ──────────────────────────────────────────────
// AI Insights Panel — Daily briefing
// ──────────────────────────────────────────────
export default {
  name: 'InsightsPanel',
  props: ['insights'],
  template: `
    <div v-if="insights">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span style="font-size:11px;color:var(--gold);font-weight:600;text-transform:uppercase;letter-spacing:1px">AI-Generated Briefing</span>
        <span style="font-size:10px;color:var(--text-muted);background:var(--bg-secondary);padding:2px 8px;border-radius:4px">Auto-updated</span>
      </div>
      <div v-for="(insight, i) in insights" :key="i" class="insight-card">
        <div class="insight-header">{{ insight.title }}</div>
        <div class="insight-body">{{ insight.body }}</div>
        <div class="insight-action">→ {{ insight.action }}</div>
      </div>
    </div>
  `,
};
