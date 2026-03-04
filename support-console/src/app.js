import { createApp, ref, computed } from 'vue';
import { PANEL_ORDER } from './layout.config.js';
import NavBar from './components/NavBar.js';
import TicketHeader from './components/TicketHeader.js';
import PanelCustomerInfo from './components/PanelCustomerInfo.js';
import PanelActivityFeed from './components/PanelActivityFeed.js';
import PanelNotes from './components/PanelNotes.js';
import DebugBar from './components/DebugBar.js';

const App = {
  components: { NavBar, TicketHeader, PanelCustomerInfo, PanelActivityFeed, PanelNotes, DebugBar },

  setup() {
    const currentRole = ref('CS_AGENT');
    const roleOptions = Object.keys(PANEL_ORDER);
    const panelIds = computed(() => PANEL_ORDER[currentRole.value]);

    return { currentRole, roleOptions, panelIds };
  },

  template: `
    <div class="console-root">
      <NavBar
        :currentRole="currentRole"
        :roleOptions="roleOptions"
        @role-change="currentRole = $event"
      />
      <main class="main-content">
        <TicketHeader />
        <div class="panels-grid">
          <template v-for="id in panelIds" :key="id">
            <PanelCustomerInfo  v-if="id === 'customer-info'" />
            <PanelActivityFeed  v-else-if="id === 'activity-feed'" />
            <PanelNotes         v-else-if="id === 'notes'" />
          </template>
        </div>
        <DebugBar :panelIds="panelIds" :currentRole="currentRole" />
      </main>
    </div>
  `,
};

createApp(App).mount('#app');
