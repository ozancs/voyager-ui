<script setup>
// Shared by the live card and Customize toolbar; changes presentation only.
import { state } from '../store';
import { t } from '../i18n';
import Icon from './Icon.vue';
</script>
<template>
  <div class="seg toolhead-style" role="radiogroup" :aria-label="t('Control style')">
    <button
      v-for="[value, label, icon] in [
        ['circle', 'Circle', 'l:circle-dot'],
        ['buttons', 'Buttons', 'l:rows-3'],
      ]"
      class="btn ibtn sm"
      role="radio"
      :aria-label="t(label)"
      :title="t(label)"
      :aria-checked="(state.settings.toolheadStyle || 'circle') === value"
      :class="{ on: (state.settings.toolheadStyle || 'circle') === value }"
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
.toolhead-style .btn {
  width: 26px;
  height: 26px;
  padding: 0;
}
</style>
