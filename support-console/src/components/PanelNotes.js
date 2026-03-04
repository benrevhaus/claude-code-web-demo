import { ref } from 'vue';
const { store } = await import(`../store.js?v=${window.V}`);

export default {
  name: 'PanelNotes',

  setup() {
    const draft = ref('');

    function post() {
      const text = draft.value.trim();
      if (!text) return;
      store.notes.push({
        id:     Date.now(),
        author: 'Alex Rivera',
        time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text,
      });
      draft.value = '';
    }

    return { store, draft, post };
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
        <span class="panel-note-count" v-if="store.notes.length">{{ store.notes.length + 1 }}</span>
      </div>
      <div class="panel-body">
        <div class="notes-section">

          <!-- seed note always shown first -->
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

          <!-- persisted notes from localStorage -->
          <div
            v-for="note in store.notes"
            :key="note.id"
            class="existing-note existing-note--posted"
          >
            <div class="note-meta">
              <span class="note-author">{{ note.author }}</span>
              <span class="note-time">{{ note.time }}</span>
            </div>
            <div class="note-text">{{ note.text }}</div>
          </div>

          <div class="note-composer">
            <textarea
              class="note-textarea"
              v-model="draft"
              placeholder="Add an internal note…"
              rows="3"
              @keydown.meta.enter="post"
              @keydown.ctrl.enter="post"
            ></textarea>
            <div class="composer-actions">
              <button class="btn btn-primary" :disabled="!draft.trim()" @click="post">Post</button>
              <button class="btn btn-ghost" @click="draft = ''">Discard</button>
            </div>
          </div>

        </div>
      </div>
    </section>
  `,
};
