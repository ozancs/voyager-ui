<script setup>
// Asks before a homing, probing, leveling or calibration command is sent while a print runs or is paused
// (store.js gcode(), dangerIn). Cancel is the default.
import Modal from './Modal.vue';
import { state } from '../store';
import { t } from '../i18n';
const answer = (v) => state.guard?.resolve(v);
</script>
<template>
  <Modal v-if="state.guard" :title="t('A print is running')" @close="answer(false)">
    <p style="margin: 0">
      {{
        t(
          '{cmd} homes, probes or moves the printer on its own. Sent now it runs between the lines of the print, and the nozzle can crash into the part or the bed.',
          { cmd: state.guard.cmd },
        )
      }}
    </p>
    <code class="cl">{{ state.guard.script }}</code>
    <template #foot>
      <button class="btn lg dg" @click="answer(true)">{{ t('Send anyway') }}</button>
      <button class="btn lg acc" autofocus @click="answer(false)">{{ t('Don’t send') }}</button>
    </template>
  </Modal>
</template>
<style scoped>
.cl {
  font-family: var(--fm);
  font-size: 12px;
  background: var(--s2);
  padding: 8px 10px;
  border-radius: 8px;
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
