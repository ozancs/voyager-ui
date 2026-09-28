<script setup>
// Lock button in the top bar (lock.js). Locking can set a PIN; unlocking asks for it.
import { ref, nextTick } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { state } from '../store';
import { lockUi, unlockUi, lockHasPin } from '../lock';
import { t } from '../i18n';
const ask = ref(false);
const pin = ref('');
const wrong = ref(false);
const inp = ref(null);
async function open() {
  pin.value = '';
  wrong.value = false;
  ask.value = true;
  await nextTick();
  inp.value?.focus();
}
async function confirm() {
  if (state.locked) {
    if (!(await unlockUi(pin.value))) {
      wrong.value = true;
      pin.value = '';
      return;
    }
  } else await lockUi(pin.value.trim());
  ask.value = false;
}
</script>
<template>
  <button
    class="btn lock"
    :class="state.locked ? 'on' : 'ibtn hide-s'"
    :aria-label="state.locked ? t('Unlock controls') : t('Lock controls')"
    :data-tip="state.locked ? t('Unlock controls') : t('Lock controls')"
    @click="open"
  >
    <Icon :name="state.locked ? 'lock' : 'unlock'" :size="20" :stroke="2.4" /><span
      v-if="state.locked"
      class="hide-m"
      >{{ t('Locked') }}</span
    >
  </button>
  <Modal v-if="ask" :title="state.locked ? t('Unlock controls') : t('Lock controls')" @close="ask = false">
    <p style="margin: 0">
      {{
        state.locked
          ? lockHasPin()
            ? t('Enter the PIN to unlock.')
            : t('Controls will work again on this browser.')
          : t(
              'This browser can watch the printer but not control it: no moves, heating, printing, restarts or file changes. E-STOP still works. Other browsers are not affected.',
            )
      }}
    </p>
    <label v-if="!state.locked || lockHasPin()" class="col" style="gap: 6px">
      <span class="mu" style="font-size: 13px">{{ state.locked ? t('PIN') : t('PIN (optional)') }}</span>
      <input
        ref="inp"
        v-model="pin"
        class="input mono"
        type="password"
        inputmode="numeric"
        autocomplete="off"
        maxlength="12"
        @keydown.enter="confirm"
      />
      <span v-if="wrong" style="color: var(--dg); font-size: 13px">{{ t('Wrong PIN') }}</span>
    </label>
    <template #foot>
      <button class="btn lg" @click="ask = false">{{ t('Cancel') }}</button>
      <button class="btn lg acc" @click="confirm">
        <Icon :name="state.locked ? 'unlock' : 'lock'" :size="18" />{{ state.locked ? t('Unlock') : t('Lock') }}
      </button>
    </template>
  </Modal>
</template>
<style scoped>
.lock.on {
  color: var(--wn);
  border-color: color-mix(in srgb, var(--wn) 45%, transparent);
  gap: 6px;
}
</style>
