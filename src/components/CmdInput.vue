<script setup>
// Input with live command search from the printer (G-code help + macros).
import { ref, computed, watch } from 'vue'
import { allCommands } from '../store'
const props = defineProps({ modelValue: String, placeholder: String, dropUp: Boolean, mono: { type: Boolean, default: true }, ariaLabel: String, inputClass: String })
const emit = defineEmits(['update:modelValue', 'enter', 'keydown'])
const open = ref(false)
const sel = ref(0)
const el = ref(null)
const word = computed(() => {
  const v = props.modelValue || ''
  const line = v.split('\n').pop()
  if (/\s/.test(line.trimStart())) return ''
  return line.trim()
})
const matches = computed(() => {
  const w = word.value.toUpperCase()
  if (!w) return []
  const all = allCommands.value.filter((c) => !c.hidden || w.startsWith('_'))
  const starts = all.filter((c) => c.name.startsWith(w))
  const inc = all.filter((c) => !c.name.startsWith(w) && c.name.includes(w))
  return [...starts, ...inc].slice(0, 12)
})
watch(matches, () => { sel.value = 0 })
const show = computed(() => open.value && matches.value.length > 0 && !(matches.value.length === 1 && matches.value[0].name === word.value.toUpperCase()))
function accept(c) {
  const v = props.modelValue || ''
  const lines = v.split('\n')
  lines[lines.length - 1] = c.name + ' '
  emit('update:modelValue', lines.join('\n'))
  open.value = false
  el.value?.focus()
}
function key(e) {
  if (show.value) {
    if (e.key === 'ArrowDown') { sel.value = (sel.value + 1) % matches.value.length; e.preventDefault(); return }
    if (e.key === 'ArrowUp') { sel.value = (sel.value - 1 + matches.value.length) % matches.value.length; e.preventDefault(); return }
    if (e.key === 'Tab' || (e.key === 'Enter' && sel.value >= 0 && matches.value[sel.value])) {
      if (e.key === 'Enter' && matches.value[sel.value].name === word.value.toUpperCase()) { /* exact: send */ } else { e.preventDefault(); accept(matches.value[sel.value]); return }
    }
    if (e.key === 'Escape') { open.value = false; e.preventDefault(); return }
  } else if (e.key === 'Tab' && matches.value.length) { e.preventDefault(); accept(matches.value[0]); return }
  emit('keydown', e)
  if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); emit('enter') }
}
function onBlur() { setTimeout(() => (open.value = false), 150) }
defineExpose({ focus: () => el.value?.focus() })
</script>
<template>
  <div class="ci">
    <input ref="el" :value="modelValue" :placeholder="placeholder" :aria-label="ariaLabel" :class="[inputClass, { mono }]" autocomplete="off" spellcheck="false"
      @input="emit('update:modelValue', $event.target.value); open = true" @focus="open = true" @blur="onBlur" @keydown="key" />
    <div v-if="show" class="dd" :class="{ up: dropUp }">
      <button v-for="(c, i) in matches" :key="c.name" type="button" class="it" :class="{ on: i === sel }" @mousedown.prevent="accept(c)" @mouseenter="sel = i">
        <span class="n mono">{{ c.name }}</span><span class="d">{{ c.desc }}</span>
      </button>
    </div>
  </div>
</template>
<style scoped>
.ci { position: relative; flex: 1; min-width: 0; display: flex; }
.ci input { flex: 1; min-width: 0; }
.dd { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 60; background: var(--s1); border: 1px solid var(--bd); border-radius: 10px; padding: 4px; max-height: 320px; overflow: auto; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
.dd.up { top: auto; bottom: calc(100% + 6px); }
.it { display: flex; align-items: baseline; gap: 12px; width: 100%; padding: 7px 10px; background: transparent; border: none; border-radius: 6px; text-align: left; }
.it.on { background: var(--s2); }
.it.on .n { color: var(--ac); }
.n { font-family: var(--fm); font-size: 12px; font-weight: 600; white-space: nowrap; }
.d { font-size: 11px; color: var(--mu); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
