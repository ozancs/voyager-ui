<script setup>
// Asks for a macro's parameters before it runs (a button set to "ask when clicked"). Fields start with the values
// saved on the button, or empty so the macro's own default applies.
import { ref, onMounted, nextTick } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { withArgs, badParamValue } from '../macros';
import { toast } from '../store';
import { t } from '../i18n';
// cmd: the button's command; only the asked parameters change, anything else in it is kept
const props = defineProps({ word: String, params: Array, values: Object, cmd: String });
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
  <Modal :title="word" width="400px" @close="emit('close')">
    <div ref="box" class="col" style="gap: 8px">
      <label v-for="p in params" :key="p.name" class="pr"
        ><span class="code">{{ p.name }}</span
        ><input v-model="vals[p.name]" class="input code" :placeholder="p.def || ''" @keydown.enter="run"
      /></label>
    </div>
    <template #foot
      ><button class="btn lg" @click="emit('close')">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="run"><Icon name="play" :size="16" />{{ t('Run') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.pr {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
</style>
