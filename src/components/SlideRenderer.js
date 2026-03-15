import { h, computed } from 'vue';

export default {
  name: 'SlideRenderer',
  props: {
    slide: { type: Object, required: true },
    isActive: { type: Boolean, default: false },
    direction: { type: String, default: 'next' },
  },
  setup(props) {
    const layoutClass = computed(() => `slide slide--${props.slide.layout}`);
    const stateClass = computed(() => props.isActive ? 'active' : '');

    return () => {
      const s = props.slide;
      const children = [];

      // Kicker
      if (s.kicker) {
        children.push(h('div', { class: 'slide-kicker' }, s.kicker));
      }

      // Priority badge
      if (s.priority) {
        children.push(h('span', {
          class: `priority-badge priority-badge--${s.priority}`
        }, s.priorityLabel));
      }

      // Title
      if (s.title) {
        children.push(h('h1', { class: 'slide-title' }, s.title));
      }

      // Subtitle (for title/section slides)
      if (s.subtitle) {
        children.push(h('p', { class: 'slide-subtitle' }, s.subtitle));
      }

      // Two-column layout
      if (s.layout === 'two-col') {
        const cols = [];

        if (s.leftContent) {
          const leftItems = [];
          leftItems.push(h('h3', { class: 'slide-h3' }, s.leftContent.heading));
          const listClass = s.leftContent.color ? `bullet-list bullet-list--${s.leftContent.color}` : 'bullet-list';
          leftItems.push(h('ul', { class: listClass },
            s.leftContent.bullets.map(b => h('li', { innerHTML: b }))
          ));
          cols.push(h('div', { class: 'col' }, leftItems));
        }

        if (s.rightContent) {
          const rightItems = [];
          rightItems.push(h('h3', { class: 'slide-h3' }, s.rightContent.heading));
          const listClass = s.rightContent.color ? `bullet-list bullet-list--${s.rightContent.color}` : 'bullet-list';
          rightItems.push(h('ul', { class: listClass },
            s.rightContent.bullets.map(b => h('li', { innerHTML: b }))
          ));
          cols.push(h('div', { class: 'col' }, rightItems));
        }

        children.push(h('div', { class: 'two-col-grid', style: 'display:flex;gap:60px;margin-top:24px;' }, cols));

        if (s.bottomHighlight) {
          children.push(h('div', { class: 'highlight-box highlight-box--green', style: 'margin-top:32px' },
            [h('p', s.bottomHighlight)]
          ));
        }

        return h('div', { class: `${layoutClass.value} ${stateClass.value}` }, children);
      }

      // Body text
      if (s.body) {
        children.push(h('p', { class: 'slide-body', innerHTML: s.body }));
      }

      // Cost chain diagram
      if (s.chain) {
        const chainItems = [];
        s.chain.forEach((step, i) => {
          chainItems.push(h('div', { class: 'cost-step' }, [
            h('div', { class: 'cost-step-label' }, step.label),
            h('div', { class: 'cost-step-sub' }, step.sub),
          ]));
          if (i < s.chain.length - 1) {
            chainItems.push(h('div', { class: 'cost-arrow' }, '→'));
          }
        });
        children.push(h('div', { class: 'cost-chain' }, chainItems));
      }

      // Tags
      if (s.tags) {
        children.push(h('div', { class: 'tag-list' },
          s.tags.map(t => h('span', { class: 'tag' }, t))
        ));
      }

      // Metrics row
      if (s.metrics) {
        children.push(h('div', { class: 'metric-row' },
          s.metrics.map(m => h('div', { class: 'metric-card' }, [
            h('div', { class: 'metric-label' }, m.label),
            h('div', { class: `metric-value metric-value--${m.color}` }, m.value),
          ]))
        ));
      }

      // Bullet list
      if (s.bullets) {
        children.push(h('ul', { class: 'bullet-list' },
          s.bullets.map(b => {
            const isObj = typeof b === 'object';
            return h('li', {
              innerHTML: isObj ? b.text : b,
              class: isObj && b.color ? `dot-${b.color}` : '',
            });
          })
        ));
      }

      // Pillars
      if (s.pillars) {
        children.push(h('div', { class: 'pillars' },
          s.pillars.map(p => h('div', { class: 'pillar' }, [
            h('div', { class: 'pillar-icon' }, p.icon),
            h('h4', p.title),
            h('p', p.desc),
          ]))
        ));
      }

      // Insight cards
      if (s.insights) {
        children.push(h('div', { class: 'insight-grid' },
          s.insights.map(ins => h('div', { class: 'insight-card' }, [
            h('div', { class: `insight-icon insight-icon--${ins.color}` }, ins.icon),
            h('h4', ins.title),
            h('p', ins.desc),
          ]))
        ));
      }

      // Query examples
      if (s.queries) {
        children.push(h('div', { class: 'query-examples' },
          s.queries.map(q => h('div', { class: 'query-example' }, q))
        ));
      }

      // Checklist
      if (s.checklist) {
        children.push(h('ul', { class: 'checklist' },
          s.checklist.map(item => h('li', item))
        ));
      }

      // Highlight box
      if (s.highlight) {
        children.push(h('div', { class: 'highlight-box' },
          [h('p', s.highlight)]
        ));
      }

      return h('div', { class: `${layoutClass.value} ${stateClass.value}` }, children);
    };
  },
};
