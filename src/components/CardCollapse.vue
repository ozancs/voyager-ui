<script setup>
// The end of a card header on the dashboard: the card's edit / options button when it has one (also outside
// Customize, so a card's own settings are one click away), then the fold chevron. Shown only for a card on the dashboard (CellScope provides the
// context); the same card elsewhere (Machine page, inside a Tabs card) gets nothing.
import { inject } from 'vue';
import Icon from './Icon.vue';
import { state } from '../store';
import { t } from '../i18n';
const ctx = inject('cellCollapse', null);
</script>
<template>
  <span v-if="ctx && !state.editDash && (ctx.can.value || ctx.edit?.value)" class="cce">
    <button
      v-if="ctx.edit?.value"
      class="clp ed"
      :aria-label="t('Edit')"
      :data-tip="ctx.edit.value === 'gear' ? t('Options') : t('Edit')"
      @click.stop="ctx.openEdit()"
    >
      <Icon :name="ctx.edit.value" :size="14" :stroke="2.4" />
    </button>
    <button
      v-if="ctx.can.value"
      class="clp"
      :aria-label="ctx.collapsed.value ? t('Expand') : t('Collapse')"
      :aria-expanded="!ctx.collapsed.value"
      @click.stop="ctx.toggle()"
    >
      <Icon name="chev" :size="14" :stroke="2.6" :style="{ transform: ctx.collapsed.value ? '' : 'rotate(90deg)' }" />
    </button>
  </span>
</template>
<style scoped>
.cce {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: 8px; /* right after the title it is pushed to the end by the header rule in style.css */
  margin-right: -6px;
}
.clp {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
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
