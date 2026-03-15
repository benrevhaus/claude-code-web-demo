import { reactive } from 'vue';

const STORAGE_KEY = 'cto_vision_slide';

function loadSlide() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch { return 0; }
}

function saveSlide(index) {
  try { localStorage.setItem(STORAGE_KEY, String(index)); } catch {}
}

export const state = reactive({
  currentSlide: loadSlide(),
});

export function setSlide(index) {
  state.currentSlide = index;
  saveSlide(index);
}
