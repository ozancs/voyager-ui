<script setup>
// A dashboard card's title. The user can give any card a name and an icon of their own in Customize
// (settings.cardTitles, by card id); the card's own name is shown otherwise. The id comes from the CellScope around
// the card. `icon`/`color` are the card's own icon (custom cards), used when none is set.
import { computed, inject } from 'vue';
import Icon from './Icon.vue';
import { state } from '../store';
const props = defineProps({ text: String, icon: String, color: String });
const id = inject('cellId', null);
const own = computed(() => (id?.value && state.settings.cardTitles?.[id.value]) || {});
const ic = computed(() => own.value.icon || props.icon);
const col = computed(() => (own.value.icon ? own.value.color : props.color) || null);
</script>
<template>
  <h2 class="ctt">
    <Icon v-if="ic" :name="ic" :size="18" :stroke="2.3" :style="col ? { color: col } : null" /><span>{{
      own.name || text
    }}</span>
  </h2>
</template>
<style scoped>
.ctt {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.ctt > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ctt > svg {
  flex: none;
}
</style>
