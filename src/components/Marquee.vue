<script setup>
// A line of text that is wider than its place glides to its end and back, instead of being cut with "…".
// Short text stands still; with reduced motion asked for it is cut as before.
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
const props = defineProps({ text: { type: String, default: '' } });
const box = ref(null);
const inner = ref(null);
const dist = ref(0); // how far the text has to move to show its end, 0 when it fits
function measure() {
  if (!box.value || !inner.value) return;
  const d = inner.value.offsetWidth - box.value.clientWidth;
  dist.value = d > 2 ? d : 0;
}
let ro = null;
onMounted(() => {
  ro = new ResizeObserver(measure);
  ro.observe(box.value);
  ro.observe(inner.value);
  measure();
});
onBeforeUnmount(() => ro?.disconnect());
watch(
  () => props.text,
  () => nextTick(measure),
);
</script>
<template>
  <span ref="box" class="mq" :class="{ run: dist }" :title="text"
    ><span
      ref="inner"
      class="in"
      :style="dist ? { '--d': -dist + 'px', '--t': (2.4 + dist / 35).toFixed(2) + 's' } : null"
      >{{ text }}</span
    ></span
  >
</template>
<style scoped>
.mq {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  min-width: 0;
}
.in {
  display: inline-block;
}
/* a rest at each end, then a steady glide (about 35 px a second) */
.run .in {
  animation: mq var(--t) linear infinite alternate;
}
@keyframes mq {
  0%,
  18% {
    transform: translateX(0);
  }
  82%,
  100% {
    transform: translateX(var(--d));
  }
}
@media (prefers-reduced-motion: reduce) {
  .mq {
    text-overflow: ellipsis;
  }
  .run .in {
    display: inline;
    animation: none;
  }
}
</style>
