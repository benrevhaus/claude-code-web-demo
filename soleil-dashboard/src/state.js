// ──────────────────────────────────────────────
// Soleil & Co. — State Management
// Single source of truth for all data access
// Only file that touches localStorage
// ──────────────────────────────────────────────
import { reactive, ref } from 'vue';
import { generateDashboardData, SCENARIOS } from './data.js';

const STORAGE_KEY = 'soleil.dashboard';
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// ── Reactive State ──
const state = reactive({
  scenario: 'steady',
  data: null,
  lastRefresh: null,
  expandedSections: {
    marketing: true,
    cs: false,
    inventory: false,
    fulfillment: false,
    alerts: true,
    insights: true,
    leaderboards: false,
    channels: false,
  },
  inventorySearch: '',
  inventoryPage: 0,
  inventorySort: 'daysOfStock',
  inventorySortDir: 'asc',
});

const countdown = ref('');
let refreshTimer = null;
let countdownTimer = null;
let catalog = null; // keep catalog stable between refreshes

// ── localStorage helpers ──
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scenario: state.scenario,
      lastRefresh: state.lastRefresh,
      expandedSections: state.expandedSections,
    }));
  } catch (e) { /* quota exceeded — ignore */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// ── Data Generation ──
function refreshData() {
  state.data = generateDashboardData(state.scenario, catalog);
  if (!catalog) catalog = state.data.products; // pin catalog
  state.lastRefresh = Date.now();
  save();
}

function setScenario(sc) {
  state.scenario = sc;
  refreshData();
}

function toggleSection(key) {
  state.expandedSections[key] = !state.expandedSections[key];
  save();
}

// ── Countdown ──
function updateCountdown() {
  if (!state.lastRefresh) return;
  const elapsed = Date.now() - state.lastRefresh;
  const remaining = Math.max(0, REFRESH_INTERVAL - elapsed);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  countdown.value = `${mins}m ${secs.toString().padStart(2, '0')}s`;
  if (remaining <= 0) refreshData();
}

// ── Init ──
function init() {
  const saved = load();
  if (saved) {
    state.scenario = saved.scenario || 'steady';
    if (saved.expandedSections) Object.assign(state.expandedSections, saved.expandedSections);
    // Check if refresh needed
    const elapsed = saved.lastRefresh ? Date.now() - saved.lastRefresh : Infinity;
    if (elapsed < REFRESH_INTERVAL) {
      state.lastRefresh = saved.lastRefresh;
    }
  }
  refreshData();
  refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);
  countdownTimer = setInterval(updateCountdown, 1000);
  updateCountdown();
}

function exportCSV(section) {
  if (!state.data) return;
  let csv = '';
  let filename = 'soleil-export.csv';

  if (section === 'inventory') {
    csv = 'SKU,Name,Category,Price,Stock,Velocity,Days of Stock,Status\n';
    state.data.inventory.items.forEach(i => {
      csv += `${i.sku},"${i.name}",${i.category},${i.price},${i.stock},${i.velocity},${i.daysOfStock},${i.status}\n`;
    });
    filename = 'soleil-inventory.csv';
  } else if (section === 'kpis') {
    const k = state.data.kpis;
    csv = 'Metric,Value\n';
    csv += `Revenue,$${k.todayRevenue.toFixed(2)}\nOrders,${k.orders}\nAOV,$${k.aov.toFixed(2)}\nUnits Sold,${k.unitsSold}\n`;
    csv += `Sessions,${k.sessions}\nConversion Rate,${(k.convRate * 100).toFixed(2)}%\nBounce Rate,${(k.bounceRate * 100).toFixed(1)}%\n`;
    csv += `Gross Margin,${(k.grossMargin * 100).toFixed(1)}%\nNet Profit,$${k.netProfit.toFixed(2)}\n`;
    filename = 'soleil-kpis.csv';
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { state, countdown, SCENARIOS, init, refreshData, setScenario, toggleSection, exportCSV };
