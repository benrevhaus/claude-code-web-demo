// ──────────────────────────────────────────────
// SectionPanel — Expandable drill-down panel
// ──────────────────────────────────────────────
export default {
  name: 'SectionPanel',
  props: ['title', 'icon', 'expanded', 'badges'],
  emits: ['toggle'],
  template: `
    <div class="section-panel">
      <div class="section-header" @click="$emit('toggle')">
        <div class="section-title">
          <span class="icon">{{ icon }}</span>
          {{ title }}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="section-badges" v-if="badges">
            <span v-for="b in badges" :key="b.text" class="badge" :class="'badge-'+b.color">{{ b.text }}</span>
          </div>
          <span class="chevron" :class="{ open: expanded }">▼</span>
        </div>
      </div>
      <div v-if="expanded" class="section-body">
        <div class="section-body-inner">
          <slot></slot>
        </div>
      </div>
    </div>
  `,
};
