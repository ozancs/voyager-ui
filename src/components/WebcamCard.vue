<script setup>
// Webcam card. With more than one camera the header has a picker; the choice is kept per card (the built-in card
// and every extra webcam card added under Customize > Add card can each show a different camera).
import { computed } from 'vue';
import Icon from './Icon.vue';
import WebcamView from './WebcamView.vue';
import { state } from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';
const props = defineProps({ id: { type: String, default: 'webcam' } });
const cams = computed(() => state.webcams.filter((w) => w.enabled !== false));
const chosen = computed({
  get: () => state.settings.cardOpts?.cams?.[props.id] || '',
  set: (v) => {
    const o = (state.settings.cardOpts ||= {});
    o.cams = { ...(o.cams || {}), [props.id]: v };
  },
});
const cam = computed(() => cams.value.find((w) => w.name === chosen.value) || cams.value[0] || null);
function snapshot() {
  if (cam.value) window.open(api.url(cam.value.snapshot_url), '_blank');
}
</script>
<template>
  <section class="card">
    <div class="card-h">
      <select
        v-if="cams.length > 1"
        class="input sel"
        :value="cam?.name"
        :aria-label="t('Camera')"
        :data-tip="t('Camera shown in this card')"
        @change="chosen = $event.target.value"
      >
        <option v-for="w in cams" :key="w.name" :value="w.name">{{ w.name }}</option>
      </select>
      <h2 v-else>{{ cam?.name || t('Webcam') }}</h2>
      <div class="acts">
        <button
          class="btn ibtn"
          :disabled="!cam"
          :aria-label="t('Snapshot')"
          :data-tip="t('Snapshot')"
          @click="snapshot"
        >
          <Icon name="snap" :size="17" :stroke="2.4" />
        </button>
        <button
          class="btn ibtn"
          :aria-label="t('Open')"
          :data-tip="t('Open')"
          @click="
            state.anchor = cam ? 'cam:' + cam.name : '';
            go('webcam');
          "
        >
          <Icon name="ext" :size="17" :stroke="2.4" />
        </button>
      </div>
    </div>
    <WebcamView :cam="cam" />
  </section>
</template>
<style scoped>
.card-h {
  flex-wrap: nowrap;
}
.sel {
  flex: 0 1 auto;
  height: 36px;
  width: auto;
  min-width: 0;
  max-width: 180px;
  padding: 0 8px;
  font-size: 14px;
  font-weight: 700;
}
</style>
