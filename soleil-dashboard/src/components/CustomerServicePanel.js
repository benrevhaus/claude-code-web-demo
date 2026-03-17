// ──────────────────────────────────────────────
// Customer Service Panel — Full CS dashboard
// ──────────────────────────────────────────────
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { fmt } from '../data.js';

export default {
  name: 'CustomerServicePanel',
  props: ['cs', 'expanded'],
  setup(props) {
    const sentChart = ref(null);
    const catChart = ref(null);
    let sentInst = null;
    let catInst = null;

    function renderCharts() {
      nextTick(() => {
        if (!props.expanded || !props.cs) return;

        // Sentiment donut
        if (sentChart.value) {
          if (sentInst) sentInst.destroy();
          const sb = props.cs.sentimentBreakdown;
          sentInst = new Chart(sentChart.value, {
            type: 'doughnut',
            data: {
              labels: ['Positive', 'Neutral', 'Negative'],
              datasets: [{
                data: [sb.positive, sb.neutral, sb.negative],
                backgroundColor: ['#6bc47d40', '#7da5c440', '#c47d6b40'],
                borderColor: ['#6bc47d', '#7da5c4', '#c47d6b'],
                borderWidth: 1.5,
              }],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              cutout: '65%',
              plugins: {
                legend: { position: 'bottom', labels: { color: '#9e96a6', font: { size: 11 }, padding: 12 } },
              },
            },
          });
        }

        // Category bar
        if (catChart.value) {
          if (catInst) catInst.destroy();
          catInst = new Chart(catChart.value, {
            type: 'bar',
            data: {
              labels: props.cs.ticketCategories.map(t => t.category),
              datasets: [{
                data: props.cs.ticketCategories.map(t => t.count),
                backgroundColor: '#c47d7d40',
                borderColor: '#c47d7d',
                borderWidth: 1,
                borderRadius: 4,
              }],
            },
            options: {
              indexAxis: 'y',
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { color: '#2a253040' }, ticks: { color: '#6b6372', font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { color: '#9e96a6', font: { size: 10 } } },
              },
            },
          });
        }
      });
    }

    watch(() => [props.expanded, props.cs], renderCharts);
    onMounted(renderCharts);
    onUnmounted(() => { if (sentInst) sentInst.destroy(); if (catInst) catInst.destroy(); });

    return { sentChart, catChart, fmt };
  },
  template: `
    <div v-if="cs">
      <div class="kpi-row" style="margin-bottom:20px">
        <div class="kpi-card">
          <div class="kpi-label">Open Tickets</div>
          <div class="kpi-value" style="color:var(--orange)">{{ fmt(cs.openTickets) }}</div>
          <div class="kpi-change" style="color:var(--text-muted)">{{ fmt(cs.newTicketsToday) }} new today</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Resolved Today</div>
          <div class="kpi-value" style="color:var(--green)">{{ fmt(cs.resolvedToday) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Response</div>
          <div class="kpi-value" style="color:var(--blue)">{{ cs.avgResponseTime.toFixed(0) }}m</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Resolution</div>
          <div class="kpi-value" style="color:var(--purple)">{{ cs.avgResolutionTime.toFixed(1) }}h</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">SLA Compliance</div>
          <div class="kpi-value" :style="{ color: cs.slaCompliance >= 0.92 ? 'var(--green)' : 'var(--red)' }">{{ (cs.slaCompliance * 100).toFixed(1) }}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">CSAT</div>
          <div class="kpi-value" style="color:var(--gold)">{{ cs.csat.toFixed(1) }} / 5</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">NPS</div>
          <div class="kpi-value" :style="{ color: cs.nps >= 50 ? 'var(--green)' : 'var(--orange)' }">{{ cs.nps }}</div>
        </div>
      </div>
      <div class="chart-row">
        <div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Sentiment Breakdown</div>
          <div class="chart-container" style="height:220px"><canvas ref="sentChart"></canvas></div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Tickets by Category</div>
          <div class="chart-container" style="height:220px"><canvas ref="catChart"></canvas></div>
        </div>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Top Agents Today</div>
        <div class="lb-row" v-for="(agent, i) in cs.csAgents" :key="agent.name">
          <div class="lb-rank" :class="i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : 'lb-rank-n'">{{ i + 1 }}</div>
          <div class="lb-name">{{ agent.name }}</div>
          <div class="lb-value">{{ agent.resolved }} resolved</div>
          <div style="font-size:12px;color:var(--text-muted)">{{ agent.csat.toFixed(1) }} ★</div>
        </div>
      </div>
    </div>
  `,
};
