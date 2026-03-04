import { store, resetSandbox } from '../store.js';

export default {
  name: 'DebugBar',

  props: {
    panelIds: { type: Array, required: true },
  },

  setup() {
    return { store, resetSandbox };
  },

  template: `
    <div class="debug-bar">
      <span class="debug-label">Layout order:</span>
      <div class="debug-pills">
        <template v-for="(id, i) in panelIds" :key="id">
          <span class="debug-pill">{{ id }}</span>
          <span v-if="i < panelIds.length - 1" class="debug-arrow">→</span>
        </template>
      </div>
      <span class="debug-source">src/layout.config.js · role: {{ store.role }}</span>
      <button class="btn-reset" @click="resetSandbox" title="Clear all localStorage and reset to defaults">
        Reset sandbox
      </button>
    </div>
  `,
};
