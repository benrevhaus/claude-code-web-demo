export default {
  name: 'DebugBar',

  props: {
    panelIds:    { type: Array,  required: true },
    currentRole: { type: String, required: true },
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
      <span class="debug-source">src/layout.config.js · role: {{ currentRole }}</span>
    </div>
  `,
};
