<script setup>
// Eye button in the Temperatures card and graph: pick which sensors they show (same list as Settings > Dashboard),
// and for the graph the line width.
import { ref } from 'vue'
import Icon from './Icon.vue'
import { state, prettyName, tempSensors } from '../store'
import { t } from '../i18n'
defineProps({ lines: Boolean })
const open = ref(false)
function toggle(s) {
  const h = state.settings.hiddenSensors || (state.settings.hiddenSensors = [])
  const i = h.indexOf(s)
  i >= 0 ? h.splice(i, 1) : h.push(s)
}
</script>
<template>
  <div class="sp">
    <button class="btn ibtn" :class="{ on: open }" :aria-label="t('Shown sensors')" :data-tip="t('Shown sensors')" @click.stop="open = !open"><Icon name="eye" :size="16" :stroke="2.4" /></button>
    <div v-if="open" class="pp card" v-away="() => (open = false)" @click.stop>
      <span class="lbl">{{ t('Shown sensors') }}</span>
      <div class="ch"><button v-for="s in tempSensors" :key="s" class="sch" :class="{ on: !(state.settings.hiddenSensors || []).includes(s) }" :aria-pressed="!(state.settings.hiddenSensors || []).includes(s)" @click="toggle(s)">{{ prettyName(s) }}</button></div>
      <template v-if="lines">
        <span class="lbl">{{ t('Line width') }}</span>
        <div class="seg"><button v-for="w in [1, 1.5, 2.5, 3.5]" :key="w" :class="{ on: (state.settings.graphLine || 2.5) === w }" @click="state.settings.graphLine = w">{{ w }}</button></div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.sp { position: relative; }
.pp { position: absolute; right: 0; top: calc(100% + 6px); width: 280px; z-index: 50; gap: 8px; padding: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.5); cursor: default; }
.ch { display: flex; flex-wrap: wrap; gap: 6px; }
.sch { height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--bd); background: transparent; color: var(--mu2); font-size: 12px; text-decoration: line-through; }
.sch.on { background: var(--s2); color: var(--tx); border-color: transparent; text-decoration: none; }
.btn.on { background: var(--s3); }
</style>
