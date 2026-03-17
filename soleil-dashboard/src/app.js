// ──────────────────────────────────────────────
// Soleil & Co. — App Bootstrap
// ──────────────────────────────────────────────
import { createApp } from 'vue';
import { state, countdown, SCENARIOS, init, refreshData, setScenario, toggleSection, exportCSV } from './state.js';
import KpiRow from './components/KpiRow.js';
import SectionPanel from './components/SectionPanel.js';
import MarketingPanel from './components/MarketingPanel.js';
import CustomerServicePanel from './components/CustomerServicePanel.js';
import InventoryPanel from './components/InventoryPanel.js';
import FulfillmentPanel from './components/FulfillmentPanel.js';
import AlertCenter from './components/AlertCenter.js';
import InsightsPanel from './components/InsightsPanel.js';
import LeaderboardPanel from './components/LeaderboardPanel.js';
import ChannelComparison from './components/ChannelComparison.js';

const RootApp = {
  components: {
    KpiRow, SectionPanel, MarketingPanel, CustomerServicePanel,
    InventoryPanel, FulfillmentPanel, AlertCenter, InsightsPanel,
    LeaderboardPanel, ChannelComparison,
  },
  setup() {
    init();

    function handleInventorySort(field) {
      if (state.inventorySort === field) {
        state.inventorySortDir = state.inventorySortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.inventorySort = field;
        state.inventorySortDir = 'asc';
      }
    }

    function handlePrint() {
      window.print();
    }

    const appVersion = window.V || 0;

    return {
      state, countdown, SCENARIOS, setScenario, toggleSection, refreshData,
      exportCSV, handleInventorySort, handlePrint, appVersion,
    };
  },
  template: `
    <!-- Header -->
    <header class="dash-header">
      <div style="display:flex;align-items:center;gap:20px">
        <div class="brand-logo">Soleil & Co.<span>Operations Dashboard</span></div>
        <div class="refresh-indicator">
          <span class="refresh-dot"></span>
          Live · Next refresh in {{ countdown }}
        </div>
      </div>
      <div class="header-controls">
        <select class="scenario-select" :value="state.scenario" @change="setScenario($event.target.value)">
          <option v-for="(sc, key) in SCENARIOS" :key="key" :value="key">{{ sc.label }}</option>
        </select>
        <button class="header-btn" @click="refreshData()">↻ Refresh Now</button>
        <button class="header-btn" @click="exportCSV('kpis')">📊 Export KPIs</button>
        <button class="header-btn" @click="handlePrint()">🖨 Print</button>
      </div>
    </header>

    <!-- Body -->
    <main class="dash-body" v-if="state.data">
      <!-- Scenario Banner -->
      <div v-if="state.scenario !== 'steady'" style="background:linear-gradient(90deg,rgba(212,175,55,0.08),rgba(196,125,125,0.08));border:1px solid var(--border-gold);border-radius:10px;padding:12px 18px;margin-bottom:20px;display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">{{ state.scenario === 'launch' ? '🚀' : '🔥' }}</span>
        <span style="font-size:13px;color:var(--gold-light);font-weight:600">{{ state.data.scenarioLabel }} Mode</span>
        <span style="font-size:12px;color:var(--text-muted)">— Data reflects {{ state.scenario === 'launch' ? 'new product launch dynamics' : 'Black Friday / holiday sale conditions' }}</span>
      </div>

      <!-- Today Comparison Badge -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <span style="font-size:13px;color:var(--text-secondary);font-weight:500">Today</span>
        <span style="font-size:11px;color:var(--text-muted);background:var(--bg-card);padding:4px 10px;border-radius:6px">vs Yesterday & Last Week</span>
        <span style="font-size:10px;color:var(--text-muted);margin-left:auto">Last updated: {{ new Date(state.data.generatedAt).toLocaleTimeString() }}</span>
      </div>

      <!-- KPI Executive Summary -->
      <KpiRow :kpis="state.data.kpis" :sparklines="state.data.sparklines" />

      <!-- Alert Center -->
      <SectionPanel
        title="Alert Center"
        icon="🔔"
        :expanded="state.expandedSections.alerts"
        :badges="[
          { text: state.data.alerts.filter(a => a.type === 'critical').length + ' Critical', color: 'red' },
          { text: state.data.alerts.filter(a => a.type === 'warning').length + ' Warning', color: 'gold' },
        ]"
        @toggle="toggleSection('alerts')"
      >
        <AlertCenter :alerts="state.data.alerts" />
      </SectionPanel>

      <!-- AI Insights -->
      <SectionPanel
        title="AI Insights"
        icon="✨"
        :expanded="state.expandedSections.insights"
        :badges="[{ text: state.data.insights.length + ' Insights', color: 'gold' }]"
        @toggle="toggleSection('insights')"
      >
        <InsightsPanel :insights="state.data.insights" />
      </SectionPanel>

      <!-- Marketing / LTV -->
      <SectionPanel
        title="Marketing & LTV"
        icon="📈"
        :expanded="state.expandedSections.marketing"
        :badges="[
          { text: (state.data.marketing.ltvCacRatio).toFixed(1) + 'x LTV:CAC', color: state.data.marketing.ltvCacRatio > 3.5 ? 'green' : 'gold' },
          { text: (state.data.marketing.repeatRate * 100).toFixed(0) + '% Repeat', color: 'blue' },
        ]"
        @toggle="toggleSection('marketing')"
      >
        <MarketingPanel :marketing="state.data.marketing" :expanded="state.expandedSections.marketing" />
      </SectionPanel>

      <!-- Customer Service -->
      <SectionPanel
        title="Customer Service"
        icon="🎧"
        :expanded="state.expandedSections.cs"
        :badges="[
          { text: state.data.customerService.openTickets + ' Open', color: state.data.customerService.openTickets > 80 ? 'red' : 'gold' },
          { text: state.data.customerService.csat.toFixed(1) + ' CSAT', color: state.data.customerService.csat >= 4.2 ? 'green' : 'gold' },
          { text: 'NPS ' + state.data.customerService.nps, color: state.data.customerService.nps >= 50 ? 'green' : 'gold' },
        ]"
        @toggle="toggleSection('cs')"
      >
        <CustomerServicePanel :cs="state.data.customerService" :expanded="state.expandedSections.cs" />
      </SectionPanel>

      <!-- Inventory -->
      <SectionPanel
        title="Inventory"
        icon="📦"
        :expanded="state.expandedSections.inventory"
        :badges="[
          state.data.inventory.outOfStock > 0 ? { text: state.data.inventory.outOfStock + ' Out', color: 'red' } : null,
          state.data.inventory.lowStock > 0 ? { text: state.data.inventory.lowStock + ' Low', color: 'gold' } : null,
          { text: state.data.inventory.total + ' SKUs', color: 'blue' },
        ].filter(Boolean)"
        @toggle="toggleSection('inventory')"
      >
        <InventoryPanel
          :inventory="state.data.inventory"
          :search="state.inventorySearch"
          :page="state.inventoryPage"
          :sortField="state.inventorySort"
          :sortDir="state.inventorySortDir"
          @update:search="state.inventorySearch = $event"
          @update:page="state.inventoryPage = $event"
          @sort="handleInventorySort"
          @export="exportCSV('inventory')"
        />
      </SectionPanel>

      <!-- Fulfillment -->
      <SectionPanel
        title="Fulfillment"
        icon="🚚"
        :expanded="state.expandedSections.fulfillment"
        :badges="[
          { text: state.data.fulfillment.shippedToday + ' Shipped', color: 'green' },
          { text: (state.data.fulfillment.returnRate * 100).toFixed(1) + '% Returns', color: state.data.fulfillment.returnRate > 0.10 ? 'red' : 'blue' },
        ]"
        @toggle="toggleSection('fulfillment')"
      >
        <FulfillmentPanel :fulfillment="state.data.fulfillment" />
      </SectionPanel>

      <!-- Leaderboards -->
      <SectionPanel
        title="Leaderboards"
        icon="🏆"
        :expanded="state.expandedSections.leaderboards"
        :badges="[{ text: 'Top 10', color: 'gold' }]"
        @toggle="toggleSection('leaderboards')"
      >
        <LeaderboardPanel :leaderboards="state.data.leaderboards" />
      </SectionPanel>

      <!-- Channel Comparison -->
      <SectionPanel
        title="Channel Comparison"
        icon="🔀"
        :expanded="state.expandedSections.channels"
        :badges="[{ text: 'Website vs Amazon', color: 'gold' }]"
        @toggle="toggleSection('channels')"
      >
        <ChannelComparison :channels="state.data.channelComparison" :expanded="state.expandedSections.channels" />
      </SectionPanel>
    </main>

    <!-- Footer -->
    <footer class="footer">
      Soleil & Co. Operations Dashboard · <span>V{{ appVersion }}</span> · Data simulated for demo purposes · Auto-refreshes every 30 minutes
    </footer>
  `,
};

const app = createApp(RootApp);
app.mount('#app');
