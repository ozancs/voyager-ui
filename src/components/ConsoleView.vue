<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import Icon from './Icon.vue'
import CmdInput from './CmdInput.vue'
import { state, gcode } from '../store'
import { t } from '../i18n'
const props = defineProps({ limit: { type: Number, default: 400 } })
const box = ref(null)
const cmd = ref('')
const hist = []
let hi = -1
const auto = ref(true)
const TEMP_RE = /^(ok\s+)?(B|T\d*|C):\s*-?\d/
const lines = computed(() => {
  let l = state.console
  l = l.filter((x) => !(x.type === 'command' && /NAME=_ui_|MSG=action:prompt_end/.test(x.message)) && !x.message.startsWith('// action:'))
  if (state.settings.consoleHideTemps) l = l.filter((x) => !TEMP_RE.test(x.message))
  return l.slice(-props.limit)
})
const fmt = (t) => new Date(t * 1000).toLocaleTimeString(undefined, { hour12: false })
function scroll() { if (auto.value && box.value) box.value.scrollTop = box.value.scrollHeight }
// lines that arrived while scrolled up, shown on the jump button
const unseen = ref(0)
// watch the last id, not the length: the list is capped, so the length stops changing once it is full
watch(() => lines.value[lines.value.length - 1]?.id, (n, o) => { if (!auto.value && n != null && o != null) unseen.value += Math.max(1, Math.min(n - o, lines.value.length)); nextTick(scroll) })
function toBottom() {
  const b = box.value
  if (!b) return
  auto.value = true; unseen.value = 0
  b.scrollTo({ top: b.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
onMounted(() => nextTick(scroll))
// command picked in Ctrl+K search lands here
const ci = ref(null)
function takeDraft() { if (state.consoleDraft) { cmd.value = state.consoleDraft; state.consoleDraft = ''; nextTick(() => ci.value?.focus()) } }
onMounted(takeDraft)
watch(() => state.consoleDraft, takeDraft)
function onScroll() {
  const b = box.value
  if (!b) return
  auto.value = b.scrollHeight - b.scrollTop - b.clientHeight < 40
  if (auto.value) unseen.value = 0
}
async function send() {
  const c = cmd.value.trim()
  if (!c) return
  hist.push(c); hi = hist.length
  cmd.value = ''
  auto.value = true
  gcode(c, { quiet: true }).catch(() => {})
}
function key(e) {
  if (e.key === 'ArrowUp') { if (hi > 0) { hi--; cmd.value = hist[hi] } e.preventDefault() }
  else if (e.key === 'ArrowDown') { if (hi < hist.length - 1) { hi++; cmd.value = hist[hi] } else { hi = hist.length; cmd.value = '' } e.preventDefault() }
}
const cls = (l) => (l.type === 'command' ? 'c' : /^!!/.test(l.message) ? 'e' : l.message.startsWith('//') ? 'i' : l.type === 'hint' ? 'h' : '')
defineExpose({ setCmd: (c) => (cmd.value = c) })
</script>
<template>
  <div class="cv">
    <div class="wrap">
      <div ref="box" class="out" @scroll="onScroll">
        <div v-for="l in lines" :key="l.id" class="ln" :class="cls(l)"><span class="t">{{ fmt(l.time) }}</span><span class="m">{{ l.type === 'command' ? '> ' : '' }}{{ l.message }}</span></div>
      </div>
      <Transition name="jb">
        <button v-if="!auto" class="jump" :aria-label="t('Scroll to bottom')" @click="toBottom">
          <span v-if="unseen" class="nw">{{ unseen > 99 ? '99+' : unseen }}</span><Icon name="down" :size="18" :stroke="2.6" />
        </button>
      </Transition>
    </div>
    <div class="row">
      <label class="in"><span class="p">&gt;</span><CmdInput ref="ci" v-model="cmd" drop-up :placeholder="t('Send G-code… (type to search commands, ↑↓ history)')" :aria-label="t('G-code command')" input-class="cin" @keydown="key" @enter="send" /></label>
      <button class="btn acc ibtn" :aria-label="t('Send')" @click="send"><Icon name="send" :stroke="2.4" /></button>
    </div>
  </div>
</template>
<style scoped>
.cv { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
.wrap { position: relative; flex: 1; min-height: 120px; display: flex; flex-direction: column; }
.jump { position: absolute; right: 18px; bottom: 14px; height: 40px; min-width: 40px; padding: 0 11px; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; border-radius: 20px; background: var(--ac); color: var(--oa); box-shadow: 0 6px 20px rgba(0,0,0,.45); font-weight: 700; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.jump:hover { filter: brightness(1.08); }
.jb-enter-active, .jb-leave-active { transition: opacity .15s, transform .15s; }
.jb-enter-from, .jb-leave-to { opacity: 0; transform: translateY(6px); }
.out { flex: 1; min-height: 120px; overflow: auto; padding: 10px 14px; background: #121418; border: none; border-radius: 10px; font-family: var(--fm); font-size: 13px; line-height: 1.7; }
.ln { display: flex; gap: 14px; color: var(--mu); }
.ln .t { color: var(--mu2); flex-shrink: 0; }
.ln .m { white-space: pre-wrap; word-break: break-word; }
.ln.c { color: var(--heat); }
.ln.e { color: var(--dg); }
.ln.i { color: var(--tx); }
.ln.h { color: var(--bl); }
.in { flex: 1; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 12px; background: var(--s2); border: 1px solid transparent; border-radius: 10px; }
.in:focus-within { border-color: var(--ac); }
.in :deep(.cin) { flex: 1; height: 40px; background: transparent; border: none; outline: none; font-family: var(--fm); font-size: 13px; }
.p { font-family: var(--fm); color: var(--ac); font-weight: 700; }
</style>
