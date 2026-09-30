<script setup>
// Pre-print check result (preprint.js): what does not fit between the file and the printer, and the choice
// to print anyway or cancel. "Don't check again" turns the check off (Settings > General turns it back on).
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { state, saveSettings } from '../store';
import { t } from '../i18n';
const answer = (v) => state.preprint?.resolve(v);
function never() {
  state.settings.preprintCheck = false;
  saveSettings();
  answer(true);
}
</script>
<template>
  <Modal v-if="state.preprint" :title="t('Before you print')" :z="190" @close="answer(false)">
    <p class="mono sm mu" style="margin: 0; word-break: break-all">{{ state.preprint.filename }}</p>
    <div v-for="(i, k) in state.preprint.issues" :key="k" class="it">
      <Icon
        :name="i.level === 'error' ? 'excl' : 'warn'"
        :size="18"
        :style="{ color: i.level === 'error' ? 'var(--dg)' : 'var(--wn)' }"
      />
      <span>{{ t(i.text, i.params) }}</span>
    </div>
    <button class="lnk sm mu" @click="never">{{ t('Print and stop checking files before printing') }}</button>
    <template #foot>
      <button class="btn lg" @click="answer(false)">{{ t('Cancel') }}</button>
      <button class="btn lg acc" @click="answer(true)">{{ t('Print anyway') }}</button>
    </template>
  </Modal>
</template>
<style scoped>
.it {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13.5px;
  line-height: 1.45;
}
.it :deep(svg) {
  flex-shrink: 0;
  margin-top: 1px;
}
.lnk {
  align-self: flex-start;
  background: none;
  border: 0;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
}
.sm {
  font-size: 12px;
}
.mu {
  color: var(--mu);
}
</style>
