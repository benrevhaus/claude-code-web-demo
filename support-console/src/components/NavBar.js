export default {
  name: 'NavBar',

  props: {
    currentRole: { type: String, required: true },
    roleOptions: { type: Array, required: true },
  },

  emits: ['role-change'],

  template: `
    <nav class="nav">
      <div class="nav-left">
        <span class="brand-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="4" fill="#0969da"/>
            <path d="M5 10h10M10 5v10" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="brand-name">CS Console</span>
      </div>

      <div class="nav-center">
        <span class="breadcrumb">Support › Tickets › <strong>#4821</strong></span>
      </div>

      <div class="nav-right">
        <select
          class="role-select"
          :value="currentRole"
          @change="$emit('role-change', $event.target.value)"
        >
          <option v-for="role in roleOptions" :key="role" :value="role">
            {{ role.replace('_', ' ') }}
          </option>
        </select>
        <div class="nav-avatar">AR</div>
      </div>
    </nav>
  `,
};
