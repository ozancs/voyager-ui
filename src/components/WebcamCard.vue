<script setup>
// Webcam card. With more than one camera the header has a picker; the choice is kept per card (the built-in card
// and every extra webcam card added under Customize > Add card can each show a different camera).
import { computed } from 'vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import WebcamView from './WebcamView.vue';
import { state, S, gcode, shortName, prettyName } from '../store';
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
// one floating window at a time; the card shows where its camera went instead of a second stream
const floating = computed(() => state.pip && state.pip.card === props.id);
function float() {
  state.pip = floating.value || !cam.value ? null : { card: props.id, cam: cam.value.name };
}
// a light switch in the header when the printer has one: the first output_pin / led / neopixel / dotstar whose
// name says light, led, lamp or case (a chamber light is what you want on while looking at the camera)
const LIGHT = /^(output_pin|led|neopixel|dotstar|pca9632|pca9533) .*(light|led|lamp|case|kasa|isik|chamber)/i;
const light = computed(() => state.objects.find((o) => LIGHT.test(o) && !/^output_pin _/.test(o)) || null);
const lightOn = computed(() => {
  const s = light.value && S(light.value);
  if (!s) return false;
  if (light.value.startsWith('output_pin')) return (s.value || 0) > 0;
  return (s.color_data?.[0] || []).some((x) => x > 0.001);
});
function toggleLight() {
  const id = light.value,
    on = !lightOn.value;
  if (id.startsWith('output_pin')) gcode(`SET_PIN PIN=${shortName(id)} VALUE=${on ? 1 : 0}`);
  else gcode(`SET_LED LED=${shortName(id)} RED=${+on} GREEN=${+on} BLUE=${+on} SYNC=0 TRANSMIT=1`);
}
function snapshot() {
  if (cam.value) window.open(api.url(cam.value.snapshot_url), '_blank', 'noopener');
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
      <h2 v-else>{{ cam?.name || t('Camera') }}</h2>
      <div class="acts">
        <button
          v-if="light"
          class="btn ibtn"
          :class="{ on: lightOn }"
          :aria-label="lightOn ? t('Light off') : t('Light on')"
          :aria-pressed="lightOn"
          :data-tip="prettyName(light)"
          @click="toggleLight"
        >
          <Icon name="bulb" :size="17" :stroke="2.4" />
        </button>
        <button
          class="btn ibtn"
          :class="{ on: floating }"
          :disabled="!cam"
          :aria-label="floating ? t('Back to the card') : t('Float')"
          :data-tip="
            floating
              ? t('Back to the card')
              : t('Float over the page: stays on screen while scrolling and on other pages')
          "
          @click="float"
        >
          <Icon name="layers" :size="17" :stroke="2.4" />
        </button>
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
      <CardCollapse />
    </div>
    <div v-if="floating" class="away">
      <Icon name="layers" :size="22" />
      <span>{{ t('Floating over the page') }}</span>
      <button class="btn" @click="state.pip = null">{{ t('Back to the card') }}</button>
    </div>
    <WebcamView v-else :cam="cam" audio />
  </section>
</template>
<style scoped>
.away {
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--mu);
  border: 1px dashed var(--bd);
  border-radius: var(--r);
}
.btn.on {
  background: var(--s3);
}
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
  font-weight: 600;
}
</style>
