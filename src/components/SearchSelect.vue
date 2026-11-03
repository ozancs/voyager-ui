<script setup>
// A select whose list can be searched: type to narrow it (every word must appear, in any order), arrows to move,
// Enter to pick, Esc to close. The list opens under the field, in the page flow, so a modal never cuts it off.
// v-model is the picked option (a string from options).
import { ref, computed, watch, nextTick } from 'vue';
import { t } from '../i18n';
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  label: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const q = ref('');
const hi = ref(0);
const list = ref(null);
const shown = computed(() => {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? props.options.filter((o) => words.every((w) => o.toLowerCase().includes(w))) : props.options;
});
watch(q, () => (hi.value = 0));
function show(e) {
  open.value = true;
  q.value = '';
  const i = props.options.indexOf(props.modelValue);
  hi.value = Math.max(0, i);
  nextTick(() => {
    e?.target?.select?.();
    scrollTo();
  });
}
function pick(o) {
  emit('update:modelValue', o);
  open.value = false;
}
function scrollTo() {
  list.value?.children[hi.value]?.scrollIntoView({ block: 'nearest' });
}
function key(e) {
  if (!open.value && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return show(e);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = shown.value.length;
    if (!n) return;
    hi.value = (hi.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    nextTick(scrollTo);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (shown.value[hi.value] != null) pick(shown.value[hi.value]);
  } else if (e.key === 'Escape' && open.value) {
    e.stopPropagation(); // closes the list, not the modal around it
    open.value = false;
  }
}
</script>
<template>
  <div class="ss">
    <input
      class="input"
      role="combobox"
      :aria-expanded="open"
      :aria-label="label || placeholder"
      :placeholder="open ? t('Search…') : placeholder"
      :value="open ? q : modelValue"
      spellcheck="false"
      autocomplete="off"
      @focus="show"
      @click="!open && show($event)"
      @input="
        q = $event.target.value;
        open = true;
      "
      @keydown="key"
      @blur="open = false"
    />
    <div v-if="open" ref="list" class="ls" role="listbox">
      <div
        v-for="(o, i) in shown"
        :key="o"
        role="option"
        class="op"
        :class="{ hi: i === hi, on: o === modelValue }"
        :aria-selected="o === modelValue"
        @mousedown.prevent="pick(o)"
        @mousemove="hi = i"
      >
        {{ o }}
      </div>
      <div v-if="!shown.length" class="none">{{ t('No match') }}</div>
    </div>
  </div>
</template>
<style scoped>
.ss {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ls {
  max-height: 240px;
  overflow: auto;
  background: var(--s2);
  border: 1px solid var(--bd);
  border-radius: var(--rb);
  padding: 4px;
}
.op {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.op.hi {
  background: var(--s3);
}
.op.on {
  color: var(--ac);
  font-weight: 600;
}
.none {
  padding: 8px 10px;
  color: var(--mu);
  font-size: 13px;
}
</style>
