<script setup>
// Shared by the live card and Customize toolbar; changes presentation only.
// flip: a single button that switches to the other style (it shows that style's icon), for a narrow card header
import { computed } from 'vue';
import { state } from '../store';
import { t } from '../i18n';
import Icon from './Icon.vue';

defineProps({ flip: Boolean });
const STYLES = [
  ['circle', 'Circle', 'l:circle-dot'],
  ['buttons', 'Buttons', 'l:rows-3'],
];
const cur = computed(() => state.settings.toolheadStyle || 'circle');
const other = computed(() => STYLES.find(([v]) => v !== cur.value));
</script>
<template>
  <button
    v-if="flip"
    class="btn ibtn sm toolhead-style flip"
    :aria-label="t('Control style') + ': ' + t(other[1])"
    :title="t('Control style') + ': ' + t(other[1])"
    @click.stop="state.settings.toolheadStyle = other[0]"
  >
    <Icon :name="other[2]" :size="15" />
  </button>
  <div v-else class="seg toolhead-style" role="radiogroup" :aria-label="t('Control style')">
    <button
      v-for="[value, label, icon] in STYLES"
      :key="value"
      class="btn ibtn sm"
      role="radio"
      :aria-label="t(label)"
      :title="t(label)"
      :aria-checked="cur === value"
      :class="{ on: cur === value }"
      @click.stop="state.settings.toolheadStyle = value"
    >
      <Icon :name="icon" :size="15" />
    </button>
  </div>
</template>
<style scoped>
.toolhead-style {
  flex: none;
}
.toolhead-style .btn,
.toolhead-style.flip {
  width: 26px;
  height: 26px;
  padding: 0;
}
</style>
