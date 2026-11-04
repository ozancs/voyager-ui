// v-zoom on a thumbnail: while the mouse is over it, the picture shows large next to the pointer (ThumbZoom.vue,
// in App.vue). The value is the URL of the large picture; without one the thumbnail itself is shown larger.
// Not on touch screens, where there is no hover.
import { reactive } from 'vue';
export const zoom = reactive({ src: '', x: 0, y: 0 });
const canHover = () => window.matchMedia?.('(hover: hover)').matches !== false;
function bind(el, binding) {
  el.__zoomSrc = binding.value || '';
  if (el.__zoomOn) return;
  el.__zoomOn = true;
  const move = (e) => {
    zoom.x = e.clientX;
    zoom.y = e.clientY;
  };
  el.addEventListener('mouseenter', (e) => {
    if (!canHover()) return;
    const src = el.__zoomSrc || el.currentSrc || el.src;
    if (!src) return;
    move(e);
    zoom.src = src;
  });
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseleave', () => (zoom.src = ''));
}
export const vzoom = {
  mounted: bind,
  updated: bind,
  unmounted() {
    zoom.src = '';
  },
};
