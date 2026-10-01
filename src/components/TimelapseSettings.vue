<script setup>
// moonraker-timelapse settings. Each change is sent at once (machine.timelapse.post_settings) and kept by the
// component in its own database, so Mainsail and Fluidd see the same values.
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import NumField from './NumField.vue';
import { tl, saveSettings } from '../timelapse';
import { state } from '../store';
import { t } from '../i18n';
const s = computed(() => tl.settings || {});
const set = (k, v) => saveSettings({ [k]: v });
const more = ref(false);
const park = ref(false);
const cams = computed(() => state.webcams.filter((w) => w.enabled !== false));
const PARK = ['custom', 'front_left', 'front_right', 'center', 'back_left', 'back_right', 'x_only', 'y_only'];
const PARK_T = {
  custom: 'Custom position',
  front_left: 'Front left',
  front_right: 'Front right',
  center: 'Center',
  back_left: 'Back left',
  back_right: 'Back right',
  x_only: 'X only',
  y_only: 'Y only',
};
// quality: CRF 0 (lossless, huge) … 51; the slider shows it the way people think about it
const quality = computed(() => Math.round(((51 - (s.value.constant_rate_factor ?? 23)) / 51) * 100));
</script>
<template>
  <div class="ts" :class="{ saving: tl.saving }">
    <label class="rw">
      <span class="col" style="gap: 2px">
        <b>{{ t('Record timelapse') }}</b>
        <span class="mu">{{ t('Starts with the next print') }}</span>
      </span>
      <Toggle :model-value="!!s.enabled" :label="t('Record timelapse')" @update:model-value="set('enabled', $event)" />
    </label>

    <div class="grp">
      <span class="lbl">{{ t('Camera') }}</span>
      <select
        class="input"
        :value="s.camera || ''"
        @change="set('camera', $event.target.value)"
        :aria-label="t('Camera')"
      >
        <option value="">{{ cams[0] ? t('{name} (first camera)', { name: cams[0].name }) : t('First camera') }}</option>
        <option v-for="c in cams" :key="c.name" :value="c.name">{{ c.name }}</option>
      </select>
      <span v-if="cams.length > 1" class="mu hint">{{
        t('One camera is recorded per print. Change it here before the print starts.')
      }}</span>
    </div>

    <div class="grp">
      <span class="lbl">{{ t('Frames') }}</span>
      <div class="seg">
        <button :class="{ on: s.mode !== 'hyperlapse' }" @click="set('mode', 'layermacro')">
          {{ t('Every layer') }}
        </button>
        <button :class="{ on: s.mode === 'hyperlapse' }" @click="set('mode', 'hyperlapse')">
          {{ t('Every N seconds') }}
        </button>
      </div>
      <NumField
        v-if="s.mode === 'hyperlapse'"
        :label="t('Seconds between frames')"
        unit="s"
        :model-value="s.hyperlapse_cycle"
        :min="1"
        :max="3600"
        @commit="set('hyperlapse_cycle', $event)"
      />
      <span v-else class="mu hint">{{ t("Needs TIMELAPSE_TAKE_FRAME in the slicer's layer change G-code.") }}</span>
    </div>

    <div class="grp">
      <span class="lbl">{{ t('Clip') }}</span>
      <label class="rw"
        ><span>{{ t('Render when the print ends') }}</span
        ><Toggle
          :model-value="!!s.autorender"
          :label="t('Render when the print ends')"
          @update:model-value="set('autorender', $event)"
      /></label>
      <label class="rw"
        ><span>{{ t('Fit the clip to a length') }}</span
        ><Toggle
          :model-value="!!s.variable_fps"
          :label="t('Fit the clip to a length')"
          @update:model-value="set('variable_fps', $event)"
      /></label>
      <template v-if="s.variable_fps">
        <NumField
          :label="t('Target length')"
          unit="s"
          :model-value="s.targetlength"
          :min="1"
          :max="3600"
          @commit="set('targetlength', $event)"
        />
        <div class="two">
          <NumField
            :label="t('Min fps')"
            :model-value="s.variable_fps_min"
            :min="1"
            :max="120"
            @commit="set('variable_fps_min', $event)"
          />
          <NumField
            :label="t('Max fps')"
            :model-value="s.variable_fps_max"
            :min="1"
            :max="120"
            @commit="set('variable_fps_max', $event)"
          />
        </div>
      </template>
      <NumField
        v-else
        :label="t('Frames per second')"
        unit="fps"
        :model-value="s.output_framerate"
        :min="1"
        :max="120"
        @commit="set('output_framerate', $event)"
      />
      <NumField
        :label="t('Hold the last frame')"
        :unit="t('frames')"
        :model-value="s.duplicatelastframe"
        :min="0"
        :max="600"
        @commit="set('duplicatelastframe', $event)"
      />
      <div class="col" style="gap: 4px">
        <div class="row" style="justify-content: space-between; font-size: 12.5px">
          <span>{{ t('Quality') }}</span
          ><span class="mono mu">{{ quality }}% · CRF {{ s.constant_rate_factor ?? 23 }}</span>
        </div>
        <input
          type="range"
          min="0"
          max="51"
          :value="51 - (s.constant_rate_factor ?? 23)"
          @change="set('constant_rate_factor', 51 - +$event.target.value)"
          :aria-label="t('Quality')"
          style="accent-color: var(--ac)"
        />
      </div>
      <div class="row" style="gap: 8px; align-items: center; flex-wrap: wrap">
        <span style="font-size: 12.5px">{{ t('Rotate') }}</span>
        <div class="seg" style="flex: 1">
          <button
            v-for="r in [0, 90, 180, 270]"
            :key="r"
            :class="{ on: (s.rotation || 0) === r }"
            @click="set('rotation', r)"
          >
            {{ r }}°
          </button>
        </div>
        <button
          class="btn clear ibtn sm"
          :class="{ on: s.flip_x }"
          :data-tip="t('Mirror left-right')"
          :aria-label="t('Mirror left-right')"
          @click="set('flip_x', !s.flip_x)"
        >
          <Icon name="flip" :size="16" :stroke="2.4" />
        </button>
        <button
          class="btn clear ibtn sm"
          :class="{ on: s.flip_y }"
          :data-tip="t('Mirror top-bottom')"
          :aria-label="t('Mirror top-bottom')"
          @click="set('flip_y', !s.flip_y)"
        >
          <Icon name="flip" :size="16" :stroke="2.4" style="transform: rotate(90deg)" />
        </button>
      </div>
    </div>

    <button class="sec" @click="park = !park">
      <Icon name="chev" :size="14" :stroke="2.6" :style="{ transform: park ? 'rotate(90deg)' : '' }" />{{
        t('Park the head for each frame')
      }}
      <span class="mu" style="margin-left: auto; font-weight: 500">{{ s.parkhead ? t('on') : t('off') }}</span>
    </button>
    <div v-if="park" class="grp ind">
      <label class="rw"
        ><span>{{ t('Park before the snapshot') }}</span
        ><Toggle
          :model-value="!!s.parkhead"
          :label="t('Park before the snapshot')"
          @update:model-value="set('parkhead', $event)"
      /></label>
      <template v-if="s.parkhead">
        <select
          class="input"
          :value="s.parkpos || 'back_left'"
          @change="set('parkpos', $event.target.value)"
          :aria-label="t('Park position')"
        >
          <option v-for="p in PARK" :key="p" :value="p">{{ t(PARK_T[p]) }}</option>
        </select>
        <div v-if="s.parkpos === 'custom'" class="two">
          <NumField
            label="X"
            unit="mm"
            :model-value="s.park_custom_pos_x"
            :decimals="1"
            @commit="set('park_custom_pos_x', $event)"
          />
          <NumField
            label="Y"
            unit="mm"
            :model-value="s.park_custom_pos_y"
            :decimals="1"
            @commit="set('park_custom_pos_y', $event)"
          />
        </div>
        <NumField
          :label="t('Lift Z')"
          unit="mm"
          :model-value="s.park_custom_pos_dz"
          :decimals="1"
          :min="0"
          @commit="set('park_custom_pos_dz', $event)"
        />
        <div class="two">
          <NumField
            :label="t('Wait at park')"
            unit="ms"
            :model-value="s.park_time"
            :min="0"
            @commit="set('park_time', $event)"
          />
          <NumField
            :label="t('Travel speed')"
            unit="mm/s"
            :model-value="s.park_travel_speed"
            :min="1"
            @commit="set('park_travel_speed', $event)"
          />
        </div>
        <label class="rw"
          ><span>{{ t('Use firmware retraction') }}</span
          ><Toggle
            :model-value="!!s.fw_retract"
            :label="t('Use firmware retraction')"
            @update:model-value="set('fw_retract', $event)"
        /></label>
        <template v-if="!s.fw_retract">
          <div class="two">
            <NumField
              :label="t('Retract')"
              unit="mm"
              :model-value="s.park_retract_distance"
              :decimals="1"
              :min="0"
              @commit="set('park_retract_distance', $event)"
            />
            <NumField
              :label="t('Retract speed')"
              unit="mm/s"
              :model-value="s.park_retract_speed"
              :min="1"
              @commit="set('park_retract_speed', $event)"
            />
          </div>
          <div class="two">
            <NumField
              :label="t('Unretract')"
              unit="mm"
              :model-value="s.park_extrude_distance"
              :decimals="1"
              :min="0"
              @commit="set('park_extrude_distance', $event)"
            />
            <NumField
              :label="t('Unretract speed')"
              unit="mm/s"
              :model-value="s.park_extrude_speed"
              :min="1"
              @commit="set('park_extrude_speed', $event)"
            />
          </div>
        </template>
      </template>
    </div>

    <button class="sec" @click="more = !more">
      <Icon name="chev" :size="14" :stroke="2.6" :style="{ transform: more ? 'rotate(90deg)' : '' }" />{{ t('More') }}
    </button>
    <div v-if="more" class="grp ind">
      <NumField
        :label="t('Stream delay')"
        unit="s"
        :model-value="s.stream_delay_compensation"
        :decimals="2"
        :step="0.05"
        :min="0"
        :max="5"
        @commit="set('stream_delay_compensation', $event)"
      />
      <span class="mu hint">{{ t('Wait after parking so a stream that lags still shows the parked head.') }}</span>
      <label class="rw"
        ><span>{{ t('Preview image next to the clip') }}</span
        ><Toggle
          :model-value="!!s.previewimage"
          :label="t('Preview image next to the clip')"
          @update:model-value="set('previewimage', $event)"
      /></label>
      <label class="rw"
        ><span>{{ t('Keep the frames as a zip') }}</span
        ><Toggle
          :model-value="!!s.saveframes"
          :label="t('Keep the frames as a zip')"
          @update:model-value="set('saveframes', $event)"
      /></label>
      <label class="rw"
        ><span>{{ t('Log each frame in the console') }}</span
        ><Toggle
          :model-value="!!s.gcode_verbose"
          :label="t('Log each frame in the console')"
          @update:model-value="set('gcode_verbose', $event)"
      /></label>
      <div class="col" style="gap: 4px">
        <span class="lbl">{{ t('Extra ffmpeg options') }}</span>
        <input
          class="input mono"
          :value="s.extraoutputparams || ''"
          :placeholder="t('none')"
          @keydown.enter="
            set('extraoutputparams', $event.target.value);
            $event.target.blur();
          "
          @keydown.esc.stop="$event.target.blur()"
          @blur="$event.target.value = s.extraoutputparams || ''"
          :aria-label="t('Extra ffmpeg options')"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.ts {
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: opacity 0.15s;
}
.ts.saving {
  opacity: 0.7;
}
.rw {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grp.ind {
  padding-left: 10px;
  border-left: 2px solid var(--bd);
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.mu {
  color: var(--mu);
}
.hint {
  font-size: 12px;
}
.sec {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--tx);
  font-weight: 600;
  font-size: 13px;
  text-align: left;
  padding: 0;
}
.sec .mu {
  font-size: 12px;
}
</style>
