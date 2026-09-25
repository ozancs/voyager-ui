<script setup>
// Multi material units, found automatically:
//   Happy Hare (ERCF, Tradrack, ...) -> printer object "mmu"
//   AFC / Box Turtle                 -> printer objects "AFC" and "AFC_stepper <lane>" / "AFC_lane <lane>"
// Gates show colour, material and which tool uses them. Anything that moves filament needs a second click.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import GateFilament from './GateFilament.vue'
import { state, S, gcode, toast, isPrinting } from '../store'
import { t } from '../i18n'

const kind = computed(() => (state.objects.includes('mmu') ? 'hh' : state.objects.includes('AFC') ? 'afc' : null))
const has = (c) => Object.keys(state.commands || {}).some((k) => k.toUpperCase() === c)
const armed = ref('')
async function run(cmd) {
  if (armed.value !== cmd) { armed.value = cmd; setTimeout(() => { if (armed.value === cmd) armed.value = '' }, 4000); return }
  armed.value = ''; open.value = null
  try { await gcode(cmd) } catch (e) { toast(e.message, 'error') }
}
const open = ref(null) // gate index with its menu open
const closeMenu = () => (open.value = null)
const openGate = computed(() => list.value.find((g) => g.id === open.value) || null)
onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))
const rgb = (c) => {
  if (!c) return null
  if (Array.isArray(c)) return `rgb(${c.slice(0, 3).map((x) => Math.round(x * 255)).join(',')})`
  const s = String(c).replace(/^#/, '')
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? '#' + s.slice(0, 6) : c
}

// ---------------- Happy Hare
const m = computed(() => S('mmu'))
const STATUS = { '-1': ['Unknown', 'var(--mu2)'], 0: ['Empty', 'var(--dg)'], 1: ['Ready', 'var(--ok)'], 2: ['Ready (buffer)', 'var(--ok)'] }
const gates = computed(() => {
  const x = m.value
  if (kind.value !== 'hh') return []
  const n = x.num_gates || (x.gate_status || []).length
  const ttg = x.ttg_map || []
  return Array.from({ length: n }, (_, g) => ({
    id: g, label: String(g),
    status: x.gate_status?.[g] ?? -1,
    color: rgb(x.gate_color_rgb?.[g]) || rgb(x.gate_color?.[g]),
    material: x.gate_material?.[g] || '',
    name: x.gate_name?.[g] || '',
    temp: x.gate_temperature?.[g],
    spoolId: x.gate_spool_id?.[g],
    tools: ttg.map((gg, tool) => (gg === g ? tool : null)).filter((v) => v != null),
    current: x.gate === g,
  }))
})
const hhTool = computed(() => (m.value.tool === -2 ? t('Bypass') : m.value.tool >= 0 ? 'T' + m.value.tool : '?'))

// ---------------- AFC / Box Turtle
const lanes = computed(() => {
  if (kind.value !== 'afc') return []
  const cur = S('AFC').current_load
  return state.objects.filter((o) => /^AFC_(stepper|lane) /.test(o)).map((o, i) => {
    const l = S(o), name = l.name || o.split(' ').slice(1).join(' ')
    const ready = l.prep && l.load
    return {
      id: name, label: name.replace(/^lane/i, ''), status: l.tool_loaded ? 1 : ready ? 1 : l.prep ? 2 : 0,
      color: rgb(l.color), material: l.material || '', weight: l.weight, spoolId: l.spool_id, tools: l.map ? [String(l.map).replace(/^T/i, '')] : [],
      current: cur === name || l.tool_loaded, loaded: !!l.tool_loaded, unit: l.unit, lstatus: l.status,
    }
  })
})
const list = computed(() => (kind.value === 'hh' ? gates.value : lanes.value))
const current = computed(() => list.value.find((g) => g.current))

function gateActions(g) {
  const out = []
  if (kind.value === 'hh') {
    for (const tool of g.tools) out.push({ label: t('Load T{n}', { n: tool }), cmd: `MMU_CHANGE_TOOL TOOL=${tool}`, need: 'MMU_CHANGE_TOOL' })
    out.push({ label: t('Select gate'), cmd: `MMU_SELECT GATE=${g.id}`, need: 'MMU_SELECT' })
    out.push({ label: t('Check gate'), cmd: `MMU_CHECK_GATE GATE=${g.id}`, need: 'MMU_CHECK_GATE' })
  } else {
    out.push({ label: t('Load to toolhead'), cmd: `CHANGE_TOOL LANE=${g.id}`, need: 'CHANGE_TOOL' })
    if (g.loaded) out.push({ label: t('Unload from toolhead'), cmd: `TOOL_UNLOAD LANE=${g.id}`, need: 'TOOL_UNLOAD' })
    out.push({ label: t('Eject lane'), cmd: `LANE_UNLOAD LANE=${g.id}`, need: 'LANE_UNLOAD' })
  }
  return out.filter((a) => has(a.need))
}
const mainActions = computed(() => {
  if (kind.value === 'hh') {
    const x = m.value
    return [
      ['MMU_LOAD', 'Load', 'load'], ['MMU_UNLOAD', 'Unload', 'unload'], ['MMU_EJECT', 'Eject', 'up'], ['MMU_HOME', 'Home', 'home'],
      ['MMU_CHECK_GATE ALL=1', 'Check all gates', 'search'], ['MMU_RECOVER', 'Recover', 'refresh'],
      ...(x.has_bypass ? [['MMU_SELECT_BYPASS', 'Bypass', 'right']] : []),
      ...(x.print_state === 'pause_locked' || x.is_locked ? [['MMU_UNLOCK', 'Unlock', 'lock']] : []),
    ].filter(([c]) => has(c.split(' ')[0]))
  }
  return [['TOOL_UNLOAD', 'Unload', 'unload'], ['AFC_CALIBRATION', 'Calibrate', 'target']].filter(([c]) => has(c))
})
// editing what is loaded in a gate / lane
const editGate = ref(null)
const canSetFilament = computed(() => (kind.value === 'hh' ? has('MMU_GATE_MAP') : has('SET_COLOR') || has('SET_MATERIAL')))
const busy = computed(() => (kind.value === 'hh' ? m.value.action && m.value.action !== 'Idle' : false))
</script>

<template>
  <section class="card mmu">
    <div class="card-h">
      <h2>{{ kind === 'afc' ? 'Box Turtle / AFC' : 'MMU' }}</h2>
      <div class="acts">
        <span v-if="kind === 'hh'" class="chip" :style="{ color: busy ? 'var(--wn)' : m.enabled === false ? 'var(--mu)' : 'var(--ok)' }"><i></i>{{ m.enabled === false ? t('Disabled') : t(m.action || 'Idle') }}</span>
        <span v-if="kind === 'hh' && m.sync_drive" class="chip" :data-tip="t('Gear motor synced to the extruder')">sync</span>
      </div>
    </div>
    <div v-if="!kind" class="empty">{{ t('No MMU found (Happy Hare or AFC).') }}</div>
    <template v-else>
      <div class="now">
        <div class="big"><span class="lbl">{{ t('Tool') }}</span><b>{{ kind === 'hh' ? hhTool : current ? 'T' + (current.tools[0] ?? '?') : '-' }}</b></div>
        <div class="big"><span class="lbl">{{ kind === 'hh' ? t('Gate') : t('Lane') }}</span><b>{{ current?.label ?? (kind === 'hh' && m.gate === -2 ? t('Bypass') : '-') }}</b></div>
        <div class="big"><span class="lbl">{{ t('Filament') }}</span><b :style="{ color: (kind === 'hh' ? m.filament === 'Loaded' : current?.loaded) ? 'var(--ok)' : 'var(--mu)' }">{{ kind === 'hh' ? t(m.filament || 'Unknown') : current?.loaded ? t('Loaded') : t('Unloaded') }}</b></div>
        <div v-if="current" class="sw big-sw" :style="{ background: current.color || 'var(--s3)' }"></div>
      </div>
      <div v-if="kind === 'hh' && m.bowden_progress >= 0 && busy" class="bar state" :style="{ '--pst': 'var(--wn)' }"><div :style="{ width: m.bowden_progress + '%' }"></div></div>
      <div v-if="kind === 'hh' && m.reason_for_pause && ['paused', 'pause_locked'].includes(m.print_state)" class="why"><Icon name="warn" :size="15" />{{ m.reason_for_pause }}</div>

      <div class="gates">
        <div v-for="g in list" :key="g.id" class="gate" :class="{ cur: g.current, gempty: g.status === 0, open: open === g.id }">
          <button class="gb" :aria-label="(kind === 'hh' ? t('Gate') : t('Lane')) + ' ' + g.label" @click.stop="open = open === g.id ? null : g.id">
            <span class="spool" :style="{ background: g.color || 'transparent' }" :class="{ none: !g.color }"></span>
            <b class="gn">{{ g.label }}</b>
            <span class="mat">{{ g.material || '—' }}</span>
            <span class="tt">{{ g.tools.length ? g.tools.map((x) => 'T' + x).join(' ') : '' }}</span>
            <i class="st" :style="{ background: (STATUS[g.status] || STATUS[-1])[1] }" :aria-label="t((STATUS[g.status] || STATUS[-1])[0])"></i>
          </button>
        </div>
      </div>

      <div v-if="openGate" class="gm"  @click.stop>
        <div class="row" style="justify-content:space-between"><b>{{ openGate.name || openGate.material || (kind === 'hh' ? t('Gate {n}', { n: openGate.label }) : openGate.id) }}</b><span class="mu sm">{{ t((STATUS[openGate.status] || STATUS[-1])[0]) }}<template v-if="openGate.temp"> · {{ openGate.temp }}°</template><template v-if="openGate.weight"> · {{ Math.round(openGate.weight) }} g</template></span></div>
        <button v-for="a in gateActions(openGate)" :key="a.cmd" class="btn" :class="{ acc: armed === a.cmd }" :disabled="isPrinting" @click="run(a.cmd)">{{ armed === a.cmd ? t('Press again to run') : a.label }}</button>
        <button v-if="canSetFilament" class="btn" @click="editGate = openGate; open = null"><Icon name="pencil" :size="14" />{{ t('Set filament') }}</button>
        <span v-if="!gateActions(openGate).length && !canSetFilament" class="mu sm">{{ t('No commands available for this unit.') }}</span>
      </div>
      <div class="acts2">
        <button v-for="[c, l, ic] in mainActions" :key="c" class="btn" :class="{ acc: armed === c }" :disabled="isPrinting && !/RECOVER|UNLOCK/.test(c)" @click="run(c)"><Icon :name="ic" :size="15" />{{ armed === c ? t('Again') : t(l) }}</button>
      </div>
    </template>
    <GateFilament v-if="editGate" :gate="editGate" :kind="kind" @close="editGate = null" />
  </section>
</template>

<style scoped>
.now { display: flex; align-items: center; gap: 28px; }
.big { display: flex; flex-direction: column; gap: 2px; }
.big b { font-size: 22px; font-variant-numeric: tabular-nums; }
.big-sw { width: 34px; height: 34px; border-radius: 17px; box-shadow: 0 0 0 3px var(--s2), 0 0 0 4px var(--bd); }
.why { display: flex; gap: 8px; align-items: center; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--wn) 14%, transparent); font-size: 13px; }
.why :deep(svg) { color: var(--wn); }
.gates { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; }
.gate { position: relative; }
.gb { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px 8px; border: none; border-radius: 12px; background: var(--s2); color: var(--tx); position: relative; }
.gb:hover { background: var(--s3); }
.gate.cur .gb { box-shadow: inset 0 0 0 2px var(--ac); }
.gate.gempty .gb { opacity: .55; }
.spool { width: 30px; height: 30px; border-radius: 15px; box-shadow: inset 0 0 0 6px rgba(0,0,0,.35); }
.spool.none { box-shadow: inset 0 0 0 2px var(--mu2); background-image: repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in srgb, var(--mu2) 40%, transparent) 4px 6px) !important; }
.gn { font-size: 14px; font-variant-numeric: tabular-nums; }
.mat { font-size: 11.5px; color: var(--mu); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt { font-size: 11px; color: var(--mu2); min-height: 14px; }
.st { position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: 4px; }
.gm { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--s2); }
.gm > .row { width: 100%; }
.gm .btn { justify-content: flex-start; }
.acts2 { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
.sm { font-size: 12px; } .mu { color: var(--mu); }
</style>
