<script setup>
// Save Config asks first and shows what Klipper is about to write into printer.cfg (save_config_pending_items):
// each section and its values, the ones being removed struck through. Klipper restarts after the save.
import { computed } from 'vue';
import Modal from './Modal.vue';
import { state, S, gcode, toast } from '../store';
import { t } from '../i18n';
const items = computed(() =>
  Object.entries(S('configfile').save_config_pending_items || {}).map(([sec, vals]) => [
    sec,
    Object.entries(vals || {}).map(([k, v]) => [k, v]),
  ]),
);
function save() {
  state.saveAsk = false;
  gcode('SAVE_CONFIG').catch((e) => toast(e.message, 'error'));
}
</script>
<template>
  <Modal v-if="state.saveAsk" :title="t('Save Config?')" width="560px" @close="state.saveAsk = false">
    <p class="mu" style="margin: 0">
      {{ t('Klipper writes these values into printer.cfg and restarts.') }}
    </p>
    <div v-if="items.length" class="sc">
      <div v-for="[sec, vals] in items" :key="sec" class="sec">
        <b class="mono">[{{ sec }}]</b>
        <div v-for="[k, v] in vals" :key="k" class="kv mono">
          <span class="k">{{ k }}</span
          ><span v-if="v == null" class="gone">{{ t('removed') }}</span
          ><span v-else class="v">{{ String(v).trim() }}</span>
        </div>
        <div v-if="!vals.length" class="mu mono kv">{{ t('the whole section is removed') }}</div>
      </div>
    </div>
    <p v-else class="mu" style="margin: 0">{{ t('Klipper did not say what changed.') }}</p>
    <template #foot
      ><button class="btn lg" autofocus @click="state.saveAsk = false">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="save">{{ t('Save and restart') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 50vh;
  overflow: auto;
  background: var(--s2);
  border-radius: var(--rb);
  padding: 10px 12px;
}
.sec {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
}
.kv {
  display: flex;
  gap: 10px;
  padding-left: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.k {
  color: var(--mu);
  min-width: 130px;
}
.gone {
  color: var(--dg);
  text-decoration: line-through;
}
</style>
