// ──────────────────────────────────────────────
// Marketing Panel — LTV-centric metrics
// ──────────────────────────────────────────────
import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue';
import { fmtCur } from '../data.js';

export default {
  name: 'MarketingPanel',
  props: ['marketing', 'expanded'],
  setup(props) {
    const ltvChart = ref(null);
    const retChart = ref(null);
    let ltvInst = null;
    let retInst = null;

    function renderCharts() {
      nextTick(() => {
        if (!props.expanded || !props.marketing) return;
        const gold = '#d4af37';
        const rose = '#c47d7d';

        // LTV Chart
        if (ltvChart.value) {
          if (ltvInst) ltvInst.destroy();
          ltvInst = new Chart(ltvChart.value, {
            type: 'bar',
            data: {
              labels: props.marketing.cohortLTV.map(c => c.month),
              datasets: [{
                label: 'Cohort LTV',
                data: props.marketing.cohortLTV.map(c => c.value),
                backgroundColor: gold + '40',
                borderColor: gold,
                borderWidth: 1.5,
                borderRadius: 4,
              }],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '$' + ctx.parsed.y.toFixed(2) } } },
              scales: {
                x: { grid: { color: '#2a253020' }, ticks: { color: '#6b6372', font: { size: 11 } } },
                y: { grid: { color: '#2a253040' }, ticks: { color: '#6b6372', font: { size: 11 }, callback: v => '$' + v } },
              },
            },
          });
        }

        // Retention Chart
        if (retChart.value) {
          if (retInst) retInst.destroy();
          retInst = new Chart(retChart.value, {
            type: 'line',
            data: {
              labels: props.marketing.retentionCurve.map(c => 'M' + c.month),
              datasets: [{
                label: 'Retention %',
                data: props.marketing.retentionCurve.map(c => c.pct),
                borderColor: rose,
                backgroundColor: rose + '15',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: rose,
              }],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y.toFixed(1) + '%' } } },
              scales: {
                x: { grid: { color: '#2a253020' }, ticks: { color: '#6b6372', font: { size: 11 } } },
                y: { grid: { color: '#2a253040' }, ticks: { color: '#6b6372', font: { size: 11 }, callback: v => v + '%' }, min: 0, max: 100 },
              },
            },
          });
        }
      });
    }

    watch(() => [props.expanded, props.marketing], renderCharts);
    onMounted(renderCharts);
    onUnmounted(() => { if (ltvInst) ltvInst.destroy(); if (retInst) retInst.destroy(); });

    return { ltvChart, retChart, fmtCur };
  },
  template: `
    <div v-if="marketing">
      <div class="kpi-row" style="margin-bottom:20px">
        <div class="kpi-card">
          <div class="kpi-label">Repeat Purchase Rate</div>
          <div class="kpi-value" style="color:var(--gold)">{{ (marketing.repeatRate * 100).toFixed(1) }}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">CAC</div>
          <div class="kpi-value" style="color:var(--rose)">{{ fmtCur(marketing.cac) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">CAC Payback</div>
          <div class="kpi-value" style="color:var(--blue)">{{ marketing.cacPayback.toFixed(1) }} orders</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">LTV:CAC Ratio</div>
          <div class="kpi-value" :style="{ color: marketing.ltvCacRatio > 3.5 ? 'var(--green)' : 'var(--orange)' }">{{ marketing.ltvCacRatio.toFixed(1) }}x</div>
        </div>
      </div>
      <div class="chart-row">
        <div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Cohort LTV</div>
          <div class="chart-container"><canvas ref="ltvChart"></canvas></div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Retention Curve</div>
          <div class="chart-container"><canvas ref="retChart"></canvas></div>
        </div>
      </div>
    </div>
  `,
};
