// ──────────────────────────────────────────────
// Channel Comparison — Website vs Amazon
// ──────────────────────────────────────────────
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { fmt, fmtCur } from '../data.js';

export default {
  name: 'ChannelComparison',
  props: ['channels', 'expanded'],
  setup(props) {
    const chartRef = ref(null);
    let chartInst = null;

    function renderChart() {
      nextTick(() => {
        if (!props.expanded || !props.channels || !chartRef.value) return;
        if (chartInst) chartInst.destroy();

        const metrics = ['Revenue', 'Orders', 'AOV', 'Conv Rate', 'Margin'];
        const wVals = [
          props.channels.website.revenue / 1000,
          props.channels.website.orders,
          props.channels.website.aov,
          props.channels.website.convRate * 100,
          props.channels.website.margin * 100,
        ];
        const aVals = [
          props.channels.amazon.revenue / 1000,
          props.channels.amazon.orders,
          props.channels.amazon.aov,
          props.channels.amazon.convRate * 100,
          props.channels.amazon.margin * 100,
        ];

        chartInst = new Chart(chartRef.value, {
          type: 'bar',
          data: {
            labels: metrics,
            datasets: [
              { label: 'Website', data: wVals, backgroundColor: '#d4af3750', borderColor: '#d4af37', borderWidth: 1.5, borderRadius: 4 },
              { label: 'Amazon', data: aVals, backgroundColor: '#c4a57d50', borderColor: '#c4a57d', borderWidth: 1.5, borderRadius: 4 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#9e96a6', font: { size: 11 } } } },
            scales: {
              x: { grid: { color: '#2a253020' }, ticks: { color: '#6b6372', font: { size: 11 } } },
              y: { grid: { color: '#2a253040' }, ticks: { color: '#6b6372', font: { size: 11 } } },
            },
          },
        });
      });
    }

    watch(() => [props.expanded, props.channels], renderChart);
    onMounted(renderChart);
    onUnmounted(() => { if (chartInst) chartInst.destroy(); });

    return { chartRef, fmt, fmtCur };
  },
  template: `
    <div v-if="channels">
      <div class="channel-grid" style="margin-bottom:20px">
        <div class="channel-col channel-website">
          <div class="channel-label">Website (DTC)</div>
          <div class="channel-stat"><span class="channel-stat-label">Revenue</span><span class="channel-stat-value" style="color:var(--gold)">{{ fmtCur(channels.website.revenue) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Orders</span><span class="channel-stat-value">{{ fmt(channels.website.orders) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">AOV</span><span class="channel-stat-value">{{ fmtCur(channels.website.aov) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Conversion</span><span class="channel-stat-value">{{ (channels.website.convRate * 100).toFixed(2) }}%</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Sessions</span><span class="channel-stat-value">{{ fmt(channels.website.sessions) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Return Rate</span><span class="channel-stat-value">{{ (channels.website.returnRate * 100).toFixed(1) }}%</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Margin</span><span class="channel-stat-value">{{ (channels.website.margin * 100).toFixed(1) }}%</span></div>
        </div>
        <div class="channel-col channel-amazon">
          <div class="channel-label">Amazon</div>
          <div class="channel-stat"><span class="channel-stat-label">Revenue</span><span class="channel-stat-value" style="color:var(--orange)">{{ fmtCur(channels.amazon.revenue) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Orders</span><span class="channel-stat-value">{{ fmt(channels.amazon.orders) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">AOV</span><span class="channel-stat-value">{{ fmtCur(channels.amazon.aov) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Conversion</span><span class="channel-stat-value">{{ (channels.amazon.convRate * 100).toFixed(2) }}%</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Sessions</span><span class="channel-stat-value">{{ fmt(channels.amazon.sessions) }}</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Return Rate</span><span class="channel-stat-value">{{ (channels.amazon.returnRate * 100).toFixed(1) }}%</span></div>
          <div class="channel-stat"><span class="channel-stat-label">Margin</span><span class="channel-stat-value">{{ (channels.amazon.margin * 100).toFixed(1) }}%</span></div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Channel Comparison (normalized)</div>
      <div class="chart-container"><canvas ref="chartRef"></canvas></div>
    </div>
  `,
};
