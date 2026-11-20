<script setup>
// A card on the Machine page that folds to its header: the header's chevron (CardCollapse) toggles it, and the
// folded cards are remembered per browser (settings.machineFold). Renders a box without a layout of its own
// (display: contents), so the page's column gap keeps working.
import { provide, computed } from 'vue';
import { state } from '../store';
const props = defineProps({ id: { type: String, required: true } });
const collapsed = computed(() => !!state.settings.machineFold?.[props.id]);
function toggle() {
  const f = { ...(state.settings.machineFold || {}) };
  if (f[props.id]) delete f[props.id];
  else f[props.id] = true;
  state.settings.machineFold = f;
}
provide('cellCollapse', {
  collapsed,
  can: computed(() => true),
  toggle,
  edit: computed(() => ''),
  openEdit: () => {},
});
</script>
<template>
  <div class="fold" :class="{ collapsed }"><slot /></div>
</template>
<style scoped>
.fold {
  display: contents;
}
/* folded: only the title and the chevron, the header buttons go too */
.collapsed > :deep(.card > *:not(.card-h)),
.collapsed > :deep(.card > .card-h > :not(:first-child, .cce)) {
  display: none !important;
}
.collapsed > :deep(.card) {
  gap: 0;
}
.collapsed > :deep(.card > .card-h > .cce) {
  margin-left: auto;
}
</style>
