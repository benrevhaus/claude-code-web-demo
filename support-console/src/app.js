import { createApp, computed } from 'vue';

const v = window.V;

const [
  { PANEL_ORDER },
  { store },
  { default: NavBar },
  { default: TicketHeader },
  { default: PanelCustomerInfo },
  { default: PanelActivityFeed },
  { default: PanelNotes },
  { default: DebugBar },
] = await Promise.all([
  import(`./layout.config.js?v=${v}`),
  import(`./store.js?v=${v}`),
  import(`./components/NavBar.js?v=${v}`),
  import(`./components/TicketHeader.js?v=${v}`),
  import(`./components/PanelCustomerInfo.js?v=${v}`),
  import(`./components/PanelActivityFeed.js?v=${v}`),
  import(`./components/PanelNotes.js?v=${v}`),
  import(`./components/DebugBar.js?v=${v}`),
]);

const App = {
  components: { NavBar, TicketHeader, PanelCustomerInfo, PanelActivityFeed, PanelNotes, DebugBar },

  setup() {
    const roleOptions = Object.keys(PANEL_ORDER);
    const panelIds = computed(() => PANEL_ORDER[store.role]);
    return { store, roleOptions, panelIds };
  },

  template: `
    <div class="console-root">
      <NavBar :roleOptions="roleOptions" />
      <main class="main-content">
        <TicketHeader />
        <div class="panels-grid">
          <template v-for="id in panelIds" :key="id">
            <PanelCustomerInfo  v-if="id === 'customer-info'" />
            <PanelActivityFeed  v-else-if="id === 'activity-feed'" />
            <PanelNotes         v-else-if="id === 'notes'" />
          </template>
        </div>
        <DebugBar :panelIds="panelIds" />
      </main>
    </div>
  `,
};

export default createApp(App).mount('#app');
