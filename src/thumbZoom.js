// v-zoom on a thumbnail: while the mouse is over it, the picture shows large over it, the thumbnail in one of its
// bottom corners (ThumbZoom.vue, in App.vue). The value is the URL of the large picture; without one the thumbnail itself is shown larger.
// Not on touch screens, where there is no hover.
import { reactive } from 'vue';
export const zoom = reactive({ src: '', rect: null });
const canHover = () => window.matchMedia?.('(hover: hover)').matches !== false;
function bind(el, binding) {
  el.__zoomSrc = binding.value || '';
  if (el.__zoomOn) return;
  el.__zoomOn = true;
  el.addEventListener('mouseenter', () => {
    if (!canHover()) return;
    const src = el.__zoomSrc || el.currentSrc || el.src;
    if (!src) return;
    const r = el.getBoundingClientRect();
    zoom.rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    zoom.src = src;
  });
  el.addEventListener('mouseleave', () => (zoom.src = ''));
}
export const vzoom = {
  mounted: bind,
  updated: bind,
  unmounted() {
    zoom.src = '';
  },
};
