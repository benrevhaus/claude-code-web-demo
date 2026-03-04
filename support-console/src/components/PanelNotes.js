import { ref } from 'vue';

export default {
  name: 'PanelNotes',

  setup() {
    const draft = ref('');
    return { draft };
  },

  template: `
    <section class="panel">
      <div class="panel-header">
        <span class="panel-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 3.75A.75.75 0 0 1 .75 3h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 3.75zm0 4A.75.75 0 0 1 .75 7h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 7.75zm0 4a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75z"/>
          </svg>
        </span>
        <span class="panel-title">Internal Notes</span>
      </div>
      <div class="panel-body">
        <div class="notes-section">
          <div class="existing-note">
            <div class="note-meta">
              <span class="note-author">Alex Rivera</span>
              <span class="note-time">10:33 AM</span>
            </div>
            <div class="note-text">
              Export bug confirmed — affects Pro accounts after Feb 15.
              Engineering tracking as BUG-2241. ETA ~24h. Offer 1-month credit.
            </div>
          </div>
          <div class="note-composer">
            <textarea
              class="note-textarea"
              v-model="draft"
              placeholder="Add an internal note…"
              rows="3"
            ></textarea>
            <div class="composer-actions">
              <button class="btn btn-primary" @click="draft = ''">Post</button>
              <button class="btn btn-ghost"   @click="draft = ''">Discard</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
};
