// Controls panel order per role. Only file that changes during demo.
// Valid IDs: 'customer-info' | 'activity-feed' | 'notes'
export const PANEL_ORDER = {
  CS_AGENT: [
    'customer-info',   // ← DEMO: move 'notes' above this to fix the workflow
    'activity-feed',
    'notes',
  ],
  CS_MANAGER: [
    'notes',
    'customer-info',
    'activity-feed',
  ],
};
