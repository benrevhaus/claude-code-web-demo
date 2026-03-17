// ──────────────────────────────────────────────
// Fulfillment Panel — Summary KPIs
// ──────────────────────────────────────────────
import { fmt } from '../data.js';

export default {
  name: 'FulfillmentPanel',
  props: ['fulfillment'],
  setup() { return { fmt }; },
  template: `
    <div v-if="fulfillment" class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">Shipped Today</div>
        <div class="kpi-value" style="color:var(--green)">{{ fmt(fulfillment.shippedToday) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pending Shipments</div>
        <div class="kpi-value" style="color:var(--orange)">{{ fmt(fulfillment.pendingShipments) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg Ship Time</div>
        <div class="kpi-value" style="color:var(--blue)">{{ fulfillment.avgShipTime.toFixed(1) }} days</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Delivered Today</div>
        <div class="kpi-value" style="color:var(--green)">{{ fmt(fulfillment.deliveredToday) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Return Rate</div>
        <div class="kpi-value" :style="{ color: fulfillment.returnRate > 0.10 ? 'var(--red)' : 'var(--text-secondary)' }">{{ (fulfillment.returnRate * 100).toFixed(1) }}%</div>
      </div>
    </div>
  `,
};
