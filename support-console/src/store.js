import { reactive, watch } from 'vue';

const KEYS = {
  role:         'sc_role',
  notes:        'sc_notes',
  ticketStatus: 'sc_ticket_status',
};

const DEFAULTS = {
  role:         'CS_AGENT',
  notes:        [],
  ticketStatus: 'open',
};

function load(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

export const store = reactive({
  role:         load(KEYS.role,         DEFAULTS.role),
  notes:        load(KEYS.notes,        DEFAULTS.notes),
  ticketStatus: load(KEYS.ticketStatus, DEFAULTS.ticketStatus),
});

watch(() => store.role,         v => localStorage.setItem(KEYS.role,         JSON.stringify(v)));
watch(() => store.notes,        v => localStorage.setItem(KEYS.notes,        JSON.stringify(v)), { deep: true });
watch(() => store.ticketStatus, v => localStorage.setItem(KEYS.ticketStatus, JSON.stringify(v)));

export function resetSandbox() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  store.role         = DEFAULTS.role;
  store.notes        = [];
  store.ticketStatus = DEFAULTS.ticketStatus;
}
