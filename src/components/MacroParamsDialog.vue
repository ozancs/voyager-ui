<script setup>
// Asks for a macro's parameters before it runs (a button set to "ask when clicked", or the arrow next to a macro).
// Fields start with the values saved on the button, or empty so the macro's own default applies. With an anchor it
// opens as a drop-down under that button, without darkening the page, so the console stays usable next to it.
import { ref, onMounted, nextTick } from 'vue';
import Modal from './Modal.vue';
import Popover from './Popover.vue';
import Icon from './Icon.vue';
import { withArgs, badParamValue } from '../macros';
import { toast } from '../store';
import { t } from '../i18n';
// cmd: the button's command; only the asked parameters change, anything else in it is kept
const props = defineProps({ word: String, params: Array, values: Object, cmd: String, anchor: Object });
const emit = defineEmits(['run', 'close']);
const vals = ref(Object.fromEntries(props.params.map((p) => [p.name, props.values?.[p.name] ?? ''])));
const box = ref(null);
onMounted(() => nextTick(() => box.value?.querySelector('input')?.focus()));
function run() {
  const bad = Object.entries(vals.value).find(([, v]) => badParamValue(v));
  if (bad) return toast(t('{name}: the characters # ; * and " cannot be sent to Klipper', { name: bad[0] }), 'warn');
  emit('run', withArgs(props.cmd, vals.value));
}
</script>
<template>
  <Popover v-if="anchor" :anchor="anchor" :width="320" @close="emit('close')">
    <div ref="box" class="col" style="gap: 8px">
      <b class="code pw">{{ word }}</b>
      <label v-for="p in params" :key="p.name" class="pr"
        ><span class="code">{{ p.name }}</span
        ><input v-model="vals[p.name]" class="input code pin" :placeholder="p.def || ''" @keydown.enter="run"
      /></label>
      <button class="btn acc" style="align-self: flex-end" @click="run">
        <Icon name="play" :size="15" />{{ t('Run') }}
      </button>
    </div>
  </Popover>
  <Modal v-else :title="word" width="400px" @close="emit('close')">
    <div ref="box" class="col" style="gap: 8px">
      <label v-for="p in params" :key="p.name" class="pr"
        ><span class="code">{{ p.name }}</span
        ><input v-model="vals[p.name]" class="input code pin" :placeholder="p.def || ''" @keydown.enter="run"
      /></label>
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
