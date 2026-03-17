// ──────────────────────────────────────────────
// KPI Row — Executive Summary Cards
// ──────────────────────────────────────────────
import { h, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { fmt, fmtCur, fmtPct } from '../data.js';

function createSparkline(canvas, data, color) {
  if (!canvas || !window.Chart) return null;
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.5,
        fill: true,
        backgroundColor: color + '15',
        pointRadius: 0,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 600 },
    },
  });
}

export default {
  name: 'KpiRow',
  props: ['kpis', 'sparklines'],
  setup(props) {
    const charts = ref([]);
    const canvasRefs = {};

    const cards = () => {
      if (!props.kpis) return [];
      const k = props.kpis;
      const revChange = ((k.todayRevenue / k.yesterdayRevenue) - 1) * 100;
      const revWeekChange = ((k.todayRevenue / k.lastWeekRevenue) - 1) * 100;
      return [
        { label: 'Revenue', value: fmtCur(k.todayRevenue), change: revChange, vs: 'vs yesterday', sparkKey: 'revenue', color: '#d4af37' },
        { label: 'Orders', value: fmt(k.orders), change: ((k.orders / (k.yesterdayRevenue / k.aov)) - 1) * 100, vs: 'vs yesterday', sparkKey: 'orders', color: '#c47d7d' },
        { label: 'AOV', value: fmtCur(k.aov), change: null, vs: '', color: '#7da5c4' },
        { label: 'Units Sold', value: fmt(k.unitsSold), change: null, vs: '', color: '#a57dc4' },
        { label: 'Sessions', value: fmt(k.sessions), change: null, sparkKey: 'sessions', color: '#6bc47d' },
        { label: 'Conversion', value: (k.convRate * 100).toFixed(2) + '%', change: null, sparkKey: 'convRate', color: '#d4af37' },
        { label: 'Bounce Rate', value: (k.bounceRate * 100).toFixed(1) + '%', change: null, color: '#c47d7d', invert: true },
        { label: 'Cart Abandon', value: (k.cartAbandonment * 100).toFixed(1) + '%', change: null, color: '#c4a57d', invert: true },
        { label: 'Gross Margin', value: (k.grossMargin * 100).toFixed(1) + '%', change: null, color: '#6bc47d' },
        { label: 'Net Profit', value: fmtCur(k.netProfit), change: null, color: k.netProfit > 0 ? '#6bc47d' : '#c47d6b' },
        { label: 'Reviews Today', value: fmt(k.newReviews), change: null, color: '#d4af37' },
        { label: 'Avg Rating', value: k.avgRating.toFixed(1) + ' ★', change: null, color: '#e8c967' },
      ];
    };

    return { cards, canvasRefs };
  },
  template: `
    <div class="kpi-row">
      <div v-for="(card, i) in cards()" :key="card.label" class="kpi-card">
        <div class="kpi-label">{{ card.label }}</div>
        <div class="kpi-value" :style="{ color: card.color }">{{ card.value }}</div>
        <div v-if="card.change != null" class="kpi-change" :class="card.change >= 0 ? 'up' : 'down'">
          {{ card.change >= 0 ? '▲' : '▼' }} {{ Math.abs(card.change).toFixed(1) }}% {{ card.vs }}
        </div>
      </div>
    </div>
  `,
};
