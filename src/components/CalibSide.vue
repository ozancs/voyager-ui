<script setup>
// Beside the calibrations: what is needed when the printer is not in front of you. `part` 'status' is a strip
// with Home all and the hotend and bed temperatures (and how long until they reach their target); 'cam' is a
// webcam picture, the camera remembered in the settings.
import { computed } from 'vue';
import Icon from './Icon.vue';
import WebcamView from './WebcamView.vue';
import { state, S, gcode, isPrinting, prettyName } from '../store';
import { heatEta, fmtEta } from '../heatEta';
import { t } from '../i18n';
defineProps({ part: { type: String, default: 'status' } });
const homed = computed(() => ['x', 'y', 'z'].every((a) => (S('toolhead').homed_axes || '').includes(a)));
const heaters = computed(() => ['extruder', 'heater_bed'].filter((h) => state.objects.includes(h)));
const cams = computed(() => state.webcams.filter((w) => w.enabled !== false));
const cam = computed(() => cams.value.find((c) => c.name === state.settings.calibCam) || cams.value[0] || null);
</script>
<template>
  <section v-if="part === 'status'" class="card st">
    <div class="row hs">
      <button
        class="btn"
        :disabled="isPrinting || state.klippy !== 'ready'"
        :data-tip="homed ? t('All axes are homed') : t('Not homed')"
        @click="gcode('G28')"
      >
        <Icon name="home" :size="16" />{{ t('Home all') }}
      </button>
      <span class="chip" :class="{ ok: homed }"><i></i>{{ homed ? t('Homed') : t('Not homed') }}</span>
    </div>
    <div class="tmp">
      <div v-for="h in heaters" :key="h" class="tv">
        <span class="mu">{{ prettyName(h) }}</span>
        <b class="mono">{{ S(h).temperature != null ? S(h).temperature.toFixed(1) + '°' : '--' }}</b>
        <span class="mono mu sm"
          >→ {{ S(h).target > 0 ? S(h).target.toFixed(0) + '°' : t('off')
          }}<template v-if="S(h).target > 0 && heatEta(h)?.secs"> · {{ fmtEta(heatEta(h).secs) }}</template></span
        >
      </div>
    </div>
  </section>
  <section v-else-if="cam" class="card cm">
    <div class="card-h">
      <h2>{{ t('Webcam') }}</h2>
      <select
        v-if="cams.length > 1"
        class="input"
        style="width: auto; height: 32px"
        :value="cam.name"
        :aria-label="t('Webcam')"
        @change="state.settings.calibCam = $event.target.value"
      >
        <option v-for="c in cams" :key="c.name" :value="c.name">{{ c.name }}</option>
      </select>
    </div>
    <div class="pic"><WebcamView :key="cam.name" :cam="cam" /></div>
  </section>
</template>
<style scoped>
.st {
  gap: 12px;
}
.hs {
  gap: 10px;
  justify-content: space-between;
}
.chip.ok {
  color: var(--ok);
}
.tmp {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.tv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--s2);
  min-width: 0;
}
.tv b {
  font-size: 18px;
}
.mu {
  color: var(--mu);
  font-size: 12px;
}
.sm {
  font-size: 11.5px;
}
.pic {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: var(--plate);
}
.pic > :deep(*) {
  width: 100%;
  height: 100%;
}
</style>
