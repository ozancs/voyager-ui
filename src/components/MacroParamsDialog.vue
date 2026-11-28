<script setup>
// Asks for a macro's parameters before it runs (a button set to "ask when clicked", or the arrow next to a macro).
// Fields start with the values saved on the button, or empty so the macro's own default applies. With an anchor it
// opens as a drop-down under that button, without darkening the page, so the console stays usable next to it.
import { ref, computed, onMounted, nextTick } from 'vue';
import Modal from './Modal.vue';
import Popover from './Popover.vue';
import Icon from './Icon.vue';
import { withArgs, withLineArgs, badParamValue } from '../macros';
import { toast } from '../store';
import { t } from '../i18n';
// cmd: the button's command; only the asked parameters change, anything else in it is kept.
// groups (from askLines): the macro lines of a command over several lines, each with its own fields; without it
// the whole command is one macro (word, params, values).
const props = defineProps({
  word: String,
  params: Array,
  values: Object,
  cmd: String,
  anchor: Object,
  groups: Array,
});
const emit = defineEmits(['run', 'close']);
const gs = computed(
  () => props.groups || [{ i: -1, word: props.word, params: props.params, args: props.values || {} }],
);
const title = computed(() => gs.value.map((g) => g.word).join(' + '));
const key = (g, p) => g.i + '|' + p.name;
const vals = ref(Object.fromEntries(gs.value.flatMap((g) => g.params.map((p) => [key(g, p), g.args?.[p.name] ?? '']))));
const box = ref(null);
// a frame later: the drop-down stays hidden until it is placed under its button, and a hidden field takes no focus
onMounted(() =>
  nextTick(() =>
    requestAnimationFrame(() => {
      const i = box.value?.querySelector('input');
      i?.focus();
      i?.select(); // typing replaces the value shown
    }),
  ),
);
function run() {
  const bad = gs.value.flatMap((g) => g.params.filter((p) => badParamValue(vals.value[key(g, p)])))[0];
  if (bad) return toast(t('{name}: the characters # ; * and " cannot be sent to Klipper', { name: bad.name }), 'warn');
  let out = props.cmd;
  for (const g of gs.value) {
    const upd = Object.fromEntries(g.params.map((p) => [p.name, vals.value[key(g, p)]]));
    out = g.i < 0 ? withArgs(out, upd) : withLineArgs(out, g.i, upd);
  }
  emit('run', out);
}
</script>
<template>
  <Popover v-if="anchor" :anchor="anchor" :width="320" @close="emit('close')">
    <div ref="box" class="col" style="gap: 8px">
      <template v-for="(g, gi) in gs" :key="g.i">
        <b class="code pw" :class="{ nx: gi }">{{ g.word }}</b>
        <label v-for="p in g.params" :key="p.name" class="pr"
          ><span class="code">{{ p.name }}</span
          ><input v-model="vals[key(g, p)]" class="input code pin" :placeholder="p.def || ''" @keydown.enter="run"
        /></label>
      </template>
      <button class="btn acc" style="align-self: flex-end" @click="run">
        <Icon name="play" :size="15" />{{ t('Run') }}
      </button>
    </div>
  </Popover>
  <Modal v-else :title="title" width="400px" @close="emit('close')">
    <div ref="box" class="col" style="gap: 8px">
      <template v-for="(g, gi) in gs" :key="g.i">
        <b v-if="gs.length > 1" class="code pw" :class="{ nx: gi }">{{ g.word }}</b>
        <label v-for="p in g.params" :key="p.name" class="pr"
          ><span class="code">{{ p.name }}</span
          ><input v-model="vals[key(g, p)]" class="input code pin" :placeholder="p.def || ''" @keydown.enter="run"
        /></label>
      </template>
    </div>
    <template #foot
      ><button class="btn lg" @click="emit('close')">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="run"><Icon name="play" :size="16" />{{ t('Run') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.pw {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* the next macro's name sits a little apart from the fields above it */
.pw.nx {
  margin-top: 6px;
}
/* the fields stand out from the panel a little */
.pin {
  background: color-mix(in srgb, var(--ac) 7%, var(--s2));
  border-color: color-mix(in srgb, var(--ac) 25%, var(--bd));
}
.pr {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
</style>
