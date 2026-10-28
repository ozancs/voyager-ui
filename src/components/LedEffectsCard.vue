<script setup>
// LED effects card for klipper-led_effect: every [led_effect] in the config as a button, lit while the effect
// runs. A click starts it (or stops it when it runs); the square stops them all. Found by itself, nothing to set up.
import { computed } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import { state, S, gcode, toast } from '../store';
import { t } from '../i18n';
const effects = computed(() =>
  state.objects
    .filter((o) => o.startsWith('led_effect '))
    .map((o) => ({ obj: o, name: o.slice(11), on: !!S(o).enabled }))
    .sort((a, b) => a.name.localeCompare(b.name)),
);
const run = (cmd) => gcode(cmd).catch((e) => toast(e.message, 'error'));
const toggle = (e) => run(`SET_LED_EFFECT EFFECT=${e.name}${e.on ? ' STOP=1' : ''}`);
</script>
<template>
  <section class="card">
    <div class="card-h">
      <CardTitle :text="t('LED effects')" />
      <div class="acts">
        <button
          class="btn ibtn sm"
          :aria-label="t('Stop all effects')"
          :data-tip="t('Stop all effects')"
          :disabled="!effects.some((e) => e.on)"
          @click="run('STOP_LED_EFFECTS')"
        >
          <Icon name="sq" :size="14" :stroke="2.4" />
        </button>
      </div>
      <CardCollapse />
    </div>
    <div class="fx">
      <button
        v-for="e in effects"
        :key="e.obj"
        class="btn"
        :class="{ on: e.on }"
        :aria-pressed="e.on"
        :data-tip="e.on ? t('Running: click to stop') : null"
        @click="toggle(e)"
      >
        <span v-if="e.on" class="dot"></span>{{ e.name }}
      </button>
    </div>
  </section>
</template>
<style scoped>
.fx {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  overflow: auto;
  min-height: 0;
}
.fx .btn {
  height: 32px;
  font-family: var(--fm);
  font-size: 12px;
  font-weight: 500;
}
.fx .btn.on {
  background: color-mix(in srgb, var(--ac) 18%, var(--s2));
  color: var(--tx);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ac) 55%, transparent);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: var(--ac);
}
</style>
