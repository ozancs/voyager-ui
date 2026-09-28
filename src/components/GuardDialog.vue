<script setup>
// Asks before a command that would hurt the running print is sent (homing, probing, restarts, motors off, mesh
// changes)
// (store.js gcode(), dangerIn). Cancel is the default.
import Modal from './Modal.vue';
import { state } from '../store';
import { t } from '../i18n';
const answer = (v) => state.guard?.resolve(v);
// what the command does to the running print (store.js dangerKind)
const TEXT = {
  move: '{cmd} homes, probes or moves the printer on its own. Sent now it runs between the lines of the print, and the nozzle can crash into the part or the bed.',
  kill: '{cmd} restarts Klipper. The print stops for good and cannot be resumed.',
  motors: '{cmd} turns the motors off or resets their position. The printer loses its place and the print is ruined.',
  mesh: '{cmd} changes the bed mesh under the running print. The first layers can be squashed or lifted.',
};
</script>
<template>
  <Modal v-if="state.guard?.custom" :title="state.guard.custom.title" @close="answer(false)">
    <p style="margin: 0">{{ state.guard.custom.text }}</p>
    <template #foot>
      <button class="btn lg" @click="answer(false)">{{ t('Cancel') }}</button>
      <button class="btn lg acc" autofocus @click="answer(true)">{{ state.guard.custom.ok }}</button>
    </template>
  </Modal>
  <Modal v-else-if="state.guard" :title="t('A print is running')" @close="answer(false)">
    <p style="margin: 0">{{ t(TEXT[state.guard.kind] || TEXT.move, { cmd: state.guard.cmd }) }}</p>
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
