import { createApp, ref, computed, onMounted, onUnmounted, h } from 'vue';
import { slides } from './slides.js';
import { state, setSlide } from './state.js';
import SlideRenderer from './components/SlideRenderer.js';

const App = {
  setup() {
    const current = computed(() => state.currentSlide);
    const total = slides.length;
    const progressWidth = computed(() => ((current.value + 1) / total) * 100 + '%');

    function next() {
      if (current.value < total - 1) setSlide(current.value + 1);
    }

    function prev() {
      if (current.value > 0) setSlide(current.value - 1);
    }

    function goTo(i) {
      if (i >= 0 && i < total) setSlide(i);
    }

    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(total - 1);
      }
    }

    // Touch/swipe support
    let touchStartX = 0;
    function onTouchStart(e) {
      touchStartX = e.touches[0].clientX;
    }
    function onTouchEnd(e) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) next();
        else prev();
      }
    }

    onMounted(() => {
      document.addEventListener('keydown', onKey);
      document.addEventListener('touchstart', onTouchStart);
      document.addEventListener('touchend', onTouchEnd);
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    });

    return () => h('div', { class: 'deck' }, [
      // Progress bar
      h('div', { class: 'progress-bar', style: { width: progressWidth.value } }),

      // Slides
      ...slides.map((slide, i) =>
        h(SlideRenderer, {
          key: slide.id,
          slide,
          isActive: i === current.value,
        })
      ),

      // Dots
      h('div', { class: 'deck-dots' },
        slides.map((slide, i) =>
          h('button', {
            class: `deck-dot ${i === current.value ? 'active' : ''}`,
            onClick: () => goTo(i),
            title: slide.title,
          })
        )
      ),

      // Nav controls
      h('div', { class: 'deck-nav' }, [
        h('span', { class: 'nav-counter' }, `${current.value + 1} / ${total}`),
        h('button', { class: 'nav-btn', onClick: prev, disabled: current.value === 0 }, '‹'),
        h('button', { class: 'nav-btn', onClick: next, disabled: current.value === total - 1 }, '›'),
      ]),

      // Version
      h('div', { class: 'version-tag' }, `v${window.V}`),
    ]);
  },
};

createApp(App).mount('#app');

export default App;
