<script setup>
defineOptions({ inheritAttrs: false })
// All printer macros as buttons. The grid follows the card size: wide card -> many columns, tall card -> a column.
// "fit" mode shrinks buttons so everything is visible, "scroll" mode keeps a minimum size and scrolls.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Icon from './Icon.vue'
import { state, S, gcode, macroList } from '../store'
import { macroParams } from '../macros'
import { t } from '../i18n'

const opts = computed(() => state.settings.cardOpts?.macros || {})
const all = computed(() => {
  const list = opts.value.showHidden ? state.objects.filter((o) => o.startsWith('gcode_macro ')).map((o) => o.slice(12)).sort() : macroList.value
  const hid = opts.value.hidden || []
  return list.filter((m) => !hid.includes(m))
})
const q = ref('')
const shown = computed(() => (q.value ? all.value.filter((m) => m.toLowerCase().includes(q.value.toLowerCase())) : all.value))

// ---- layout ----
const box = ref(null)
const size = ref({ w: 300, h: 200 })
let ro
onMounted(() => {
  ro = new ResizeObserver(([e]) => (size.value = { w: e.contentRect.width, h: e.contentRect.height }))
  box.value && ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())
const GAP = 8
const grid = computed(() => {
  const n = Math.max(1, shown.value.length), { w, h } = size.value
  if (opts.value.scroll) {
    const cols = Math.max(1, Math.floor((w + GAP) / (130 + GAP)))
    return { cols, bh: 40, fs: 12.5, scroll: true }
  }
  // try every column count, keep the one with the biggest readable button
  let best = { cols: 1, bh: 20, fs: 11, score: -1 }
  for (let c = 1; c <= Math.min(n, 16); c++) {
    const rows = Math.ceil(n / c)
    const bw = (w - GAP * (c - 1)) / c, bh = (h - GAP * (rows - 1)) / rows
    if (bw < 60) break
    const hh = Math.min(bh, 64)
    const score = Math.min(hh, bw / 3.2)
    if (score > best.score) best = { cols: c, bh: Math.max(22, hh), fs: Math.max(11.5, Math.min(14, hh * 0.42)), score }
  }
  return { ...best, scroll: best.bh <= 22 } // too many to fit -> scroll anyway
})

// ---- params ----
const pop = ref(null) // { name, params, vals }
function click(m, e) {
  if (state.editDash) return
  // plain click runs with defaults, the arrow (or shift+click) asks for parameters
  if (e.shiftKey && macroParams(m).length) { openParams(m); return }
  gcode(m).catch(() => {})
}
function openParams(m) {
  if (state.editDash) return
  const ps = macroParams(m)
  pop.value = { name: m, params: ps, vals: Object.fromEntries(ps.map((p) => [p.name, ''])) }
  nextTick(() => document.querySelector('.mp input')?.focus())
}
function runPop() {
  const p = pop.value
  const args = Object.entries(p.vals).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${/\s/.test(v) ? '"' + v + '"' : v}`).join(' ')
  gcode(p.name + (args ? ' ' + args : '')).catch(() => {})
  pop.value = null
}
const hasParams = (m) => macroParams(m).length > 0
const pretty = (m) => m.replace(/_/g, ' ')
</script>

<template>
  <section v-bind="$attrs" class="card mc">
    <div class="card-h">
      <h2>{{ t('Macros') }}</h2>
      <div class="acts"><label v-if="all.length > 12" class="sr"><Icon name="search" :size="14" /><input v-model="q" :placeholder="t('Filter')" :aria-label="t('Filter macros')" /></label></div>
    </div>
    <div ref="box" class="box" :class="{ scroll: grid.scroll }">
      <div class="g" :style="{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridAutoRows: grid.bh + 'px', fontSize: grid.fs + 'px' }">
        <div v-for="m in shown" :key="m" class="mb" :class="{ hidm: m.startsWith('_') }">
          <button class="run" :data-tip="S('gcode_macro ' + m).description || m" @click="click(m, $event)">{{ pretty(m) }}</button>
          <button v-if="hasParams(m)" class="pm" :aria-label="t('Parameters for {name}', { name: m })" @click="openParams(m)"><Icon name="chev" :size="12" /></button>
        </div>
      </div>
      <div v-if="!shown.length" class="empty">{{ q ? t('No macro matches') : t('No macros in the config') }}</div>
    </div>
  </section>
  <Teleport to="body"><div v-if="pop" class="ov" @mousedown.self="pop = null">
    <div class="mp card" role="dialog" :aria-label="pop.name">
      <div class="card-h"><h2 class="code" style="font-size:15px">{{ pop.name }}</h2><button class="btn clear ibtn sm" :aria-label="t('Close')" @click="pop = null"><Icon name="x" :size="16" /></button></div>
      <label v-for="p in pop.params" :key="p.name" class="pr"><span class="code">{{ p.name }}</span><input v-model="pop.vals[p.name]" class="input code" :placeholder="p.def || ''" @keydown.enter="runPop" /></label>
      <div class="row" style="justify-content:flex-end"><button class="btn lg" @click="pop = null">{{ t('Cancel') }}</button><button class="btn lg acc" @click="runPop"><Icon name="play" :size="16" />{{ t('Run') }}</button></div>
    </div>
  </div></Teleport>
</template>

<style scoped>
.mc { min-height: 0; }
.box { flex: 1; min-height: 0; overflow: hidden; }
.box.scroll { overflow-y: auto; padding-right: 2px; }
.g { display: grid; gap: 8px; }
.mb { display: flex; min-width: 0; border-radius: 10px; background: var(--s2); overflow: hidden; }
.mb:hover { background: var(--s3); }
.run { flex: 1; min-width: 0; border: none; background: transparent; color: var(--tx); font-weight: 600; font-size: inherit; padding: 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; text-transform: lowercase; }
.run::first-letter { text-transform: uppercase; }
.pm { width: 26px; flex-shrink: 0; border: none; border-left: 1px solid var(--bg); background: transparent; color: var(--mu); display: flex; align-items: center; justify-content: center; }
.pm:hover { color: var(--ac); }
.hidm .run { color: var(--mu); }
.sr { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; background: var(--s2); color: var(--mu); }
.sr input { width: 110px; border: none; background: transparent; outline: none; font-size: 12.5px; color: var(--tx); }
.ov { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 110; display: flex; align-items: center; justify-content: center; padding: 16px; }
.mp { width: 380px; max-width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.pr { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: 10px; font-size: 13px; }
</style>
