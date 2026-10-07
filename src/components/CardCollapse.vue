<script setup>
// The fold chevron at the end of a card header. Shown only for a card on the dashboard (CellScope provides the
// context); the same card elsewhere (Machine page, inside a Tabs card) gets nothing.
import { inject } from 'vue';
import Icon from './Icon.vue';
import { state } from '../store';
import { t } from '../i18n';
const ctx = inject('cellCollapse', null);
</script>
<template>
  <button
    v-if="ctx && ctx.can.value && !state.editDash"
    class="clp"
    :aria-label="ctx.collapsed.value ? t('Expand') : t('Collapse')"
    :aria-expanded="!ctx.collapsed.value"
    @click.stop="ctx.toggle()"
  >
    <Icon name="chev" :size="14" :stroke="2.6" :style="{ transform: ctx.collapsed.value ? '' : 'rotate(90deg)' }" />
  </button>
</template>
<style scoped>
.clp {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  margin-left: auto;
  margin-right: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--mu2);
  cursor: pointer;
}
.clp:hover {
  color: var(--tx);
  background: var(--s2);
}
.clp > :deep(svg) {
  transition: transform 0.15s;
}
</style>
