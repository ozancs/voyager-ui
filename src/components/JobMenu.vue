<script setup>
// The running print's actions as a ··· menu: pause / resume, exclude object, pause at next layer, job queue and
// cancel. Used by the compact print pill in the top bar; the PrintBar band shows the same actions as buttons.
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import { state, S, printState, gcode, cancelPrint, pauseResume } from '../store';
import { go } from '../router';
import { t } from '../i18n';
const emit = defineEmits(['exclude']);
const open = ref(false);
const askCancel = ref(false);
const paused = computed(() => printState.value === 'paused');
const eo = computed(() => S('exclude_object'));
const hasCmd = (c) => Object.keys(state.commands || {}).some((k) => k.toUpperCase() === c);
const pauseNext = computed(
  () =>
    !!(S('gcode_macro SET_PRINT_STATS_INFO').pause_next_layer || S('gcode_macro SET_PAUSE_NEXT_LAYER').pause_next_layer)
      ?.enable,
);
function pick(fn) {
  open.value = false;
  fn();
}
</script>

<template>
  <div class="rel">
    <button class="btn ibtn jm" data-away="jobmenu" :aria-label="t('Print actions')" @click="open = !open">
      <span class="dots" aria-hidden="true">···</span>
    </button>
    <div v-if="open" class="dd card" v-away:jobmenu="() => (open = false)">
      <button v-if="paused" class="btn clear mi" @click="pick(() => pauseResume('RESUME'))">
        <Icon name="play" :size="18" />{{ t('Resume') }}
      </button>
      <button v-else class="btn clear mi" @click="pick(() => pauseResume('PAUSE'))">
        <Icon name="pause" :size="18" />{{ t('Pause') }}
      </button>
      <button class="btn clear mi" :disabled="!eo.objects?.length" @click="pick(() => emit('exclude'))">
        <Icon name="excl" :size="18" />{{ t('Exclude object')
        }}<span v-if="eo.objects?.length" class="mono mu" style="margin-left: auto"
          >{{ eo.objects.length - (eo.excluded_objects?.length || 0) }}/{{ eo.objects.length }}</span
        >
      </button>
      <button
        v-if="hasCmd('SET_PAUSE_NEXT_LAYER')"
        class="btn clear mi"
        @click="pick(() => gcode(pauseNext ? 'SET_PAUSE_NEXT_LAYER ENABLE=0' : 'SET_PAUSE_NEXT_LAYER ENABLE=1'))"
      >
        <Icon name="layers" :size="18" />{{ pauseNext ? t('Cancel pause at next layer') : t('Pause at next layer') }}
      </button>
      <button v-if="state.queue.jobs?.length" class="btn clear mi" @click="pick(() => go('files'))">
        <Icon name="queue" :size="18" />{{ t('Job queue')
        }}<span class="mono mu" style="margin-left: auto">{{ state.queue.jobs.length }}</span>
      </button>
      <div class="sep"></div>
      <button class="btn clear mi" style="color: var(--dg)" @click="pick(() => (askCancel = true))">
        <Icon name="sq" :size="18" />{{ t('Cancel print') }}
      </button>
    </div>
    <Modal v-if="askCancel" :title="t('Cancel print?')" @close="askCancel = false">
      <p class="mu" style="margin: 0">{{ t('The current print will be cancelled.') }}</p>
      <template #foot
        ><button class="btn lg" @click="askCancel = false">{{ t('Keep printing') }}</button
        ><button
          class="btn lg dgf"
          @click="
            askCancel = false;
            cancelPrint();
          "
        >
          {{ t('Cancel print') }}
        </button></template
      >
    </Modal>
  </div>
</template>

<style scoped>
.rel {
  position: relative;
  flex-shrink: 0;
}
.jm {
  width: 40px;
  height: 40px;
}
.dots {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  line-height: 1;
  margin-top: -4px;
}
.dd {
  position: absolute;
  right: 0;
  top: 48px;
  width: 260px;
  max-width: calc(100vw - 20px);
  z-index: 50;
  gap: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.mi {
  justify-content: flex-start;
  gap: 10px;
  height: 40px;
  color: var(--tx);
  font-weight: 600;
}
.sep {
  height: 1px;
  background: var(--bd);
  margin: 4px 0;
}
.mu {
  color: var(--mu);
}
@media (max-width: 480px) {
  /* the pill sits at the left edge on a phone, so the menu opens to the right */
  .dd {
    right: auto;
    left: -100px;
  }
}
</style>
