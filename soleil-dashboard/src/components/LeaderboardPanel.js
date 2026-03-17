// ──────────────────────────────────────────────
// Leaderboard Panel — Top products, campaigns, agents
// ──────────────────────────────────────────────
import { ref } from 'vue';
import { fmt, fmtCur } from '../data.js';

export default {
  name: 'LeaderboardPanel',
  props: ['leaderboards'],
  setup() {
    const tab = ref('products');
    return { tab, fmt, fmtCur };
  },
  template: `
    <div v-if="leaderboards">
      <div class="mini-tabs">
        <button class="mini-tab" :class="{ active: tab === 'products' }" @click="tab = 'products'">Top Products</button>
        <button class="mini-tab" :class="{ active: tab === 'campaigns' }" @click="tab = 'campaigns'">Top Campaigns</button>
        <button class="mini-tab" :class="{ active: tab === 'agents' }" @click="tab = 'agents'">Top CS Agents</button>
      </div>

      <!-- Products -->
      <div v-if="tab === 'products'">
        <div class="lb-row" v-for="(p, i) in leaderboards.topProducts" :key="p.sku">
          <div class="lb-rank" :class="i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : 'lb-rank-n'">{{ i + 1 }}</div>
          <div class="lb-name">
            <div>{{ p.shortName }}</div>
            <div style="font-size:10px;color:var(--text-muted)">{{ p.line }} · {{ p.category }}</div>
          </div>
          <div class="lb-value">{{ fmtCur(p.revenue) }}</div>
        </div>
      </div>

      <!-- Campaigns -->
      <div v-if="tab === 'campaigns'">
        <div class="lb-row" v-for="(c, i) in leaderboards.topCampaigns" :key="c.name">
          <div class="lb-rank" :class="i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : 'lb-rank-n'">{{ i + 1 }}</div>
          <div class="lb-name">
            <div>{{ c.name }}</div>
            <div style="font-size:10px;color:var(--text-muted)">Spend: {{ fmtCur(c.spend) }}</div>
          </div>
          <div class="lb-value">{{ c.roas.toFixed(1) }}x ROAS</div>
        </div>
      </div>

      <!-- Agents -->
      <div v-if="tab === 'agents'">
        <div class="lb-row" v-for="(a, i) in leaderboards.csAgents" :key="a.name">
          <div class="lb-rank" :class="i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : 'lb-rank-n'">{{ i + 1 }}</div>
          <div class="lb-name">{{ a.name }}</div>
          <div class="lb-value">{{ a.resolved }} resolved</div>
          <div style="font-size:12px;color:var(--gold)">{{ a.csat.toFixed(1) }} ★</div>
        </div>
      </div>
    </div>
  `,
};
