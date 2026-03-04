export default {
  name: 'PanelCustomerInfo',

  template: `
    <section class="panel">
      <div class="panel-header">
        <span class="panel-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z"/>
          </svg>
        </span>
        <span class="panel-title">Customer Info</span>
      </div>
      <div class="panel-body">
        <div class="customer-info-layout">
          <div class="customer-avatar">SC</div>
          <div class="customer-details">
            <div class="customer-name-row">
              <span class="customer-name">Sarah Chen</span>
              <span class="badge badge-pro">Pro</span>
            </div>
            <div class="customer-email">sarah.chen@acmecorp.com</div>
            <div class="info-grid">
              <span class="info-label">Account ID</span>
              <span class="info-value">ACC-8821</span>
              <span class="info-label">Member since</span>
              <span class="info-value">March 2022</span>
              <span class="info-label">Tickets (90d)</span>
              <span class="info-value">3</span>
              <span class="info-label">Health score</span>
              <span class="info-value health-score">92 / 100</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
};
