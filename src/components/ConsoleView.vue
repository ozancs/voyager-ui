<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import Icon from './Icon.vue'
import CmdInput from './CmdInput.vue'
import { state, gcode } from '../store'
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
watch(() => lines.value.length, () => nextTick(scroll))
onMounted(() => nextTick(scroll))
// command picked in Ctrl+K search lands here
const ci = ref(null)
function takeDraft() { if (state.consoleDraft) { cmd.value = state.consoleDraft; state.consoleDraft = ''; nextTick(() => ci.value?.focus()) } }
onMounted(takeDraft)
watch(() => state.consoleDraft, takeDraft)
function onScroll() {
  const b = box.value
  auto.value = b.scrollHeight - b.scrollTop - b.clientHeight < 40
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
    <div ref="box" class="out" @scroll="onScroll">
      <div v-for="l in lines" :key="l.id" class="ln" :class="cls(l)"><span class="t">{{ fmt(l.time) }}</span><span class="m">{{ l.type === 'command' ? '> ' : '' }}{{ l.message }}</span></div>
    </div>
    <div class="row">
      <label class="in"><span class="p">&gt;</span><CmdInput ref="ci" v-model="cmd" drop-up placeholder="Send G-code… (type to search commands, ↑↓ history)" aria-label="G-code command" input-class="cin" @keydown="key" @enter="send" /></label>
      <button class="btn acc ibtn" aria-label="Send" @click="send"><Icon name="send" :stroke="2.4" /></button>
    </div>
  </div>
</template>
<style scoped>
.cv { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
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
