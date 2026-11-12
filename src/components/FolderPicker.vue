<script setup>
// "Move to…": pick a folder of a root (gcodes, config) by walking into it. Emits pick with the full path.
import { ref, onMounted } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { api } from '../api/moonraker';
import { t } from '../i18n';
const props = defineProps({
  root: { type: String, default: 'gcodes' },
  start: { type: String, default: '' }, // full path the picker opens at
  count: { type: Number, default: 1 },
});
const emit = defineEmits(['pick', 'close']);
const at = ref(props.start || props.root);
const dirs = ref([]);
const busy = ref(false);
async function load() {
  busy.value = true;
  try {
    const r = await api.call('server.files.get_directory', { path: at.value, extended: false });
    dirs.value = (r.dirs || []).map((d) => d.dirname).filter((d) => !d.startsWith('.'));
  } catch {
    dirs.value = [];
  }
  busy.value = false;
}
function into(d) {
  at.value = at.value + '/' + d;
  load();
}
function up() {
  if (at.value === props.root) return;
  at.value = at.value.split('/').slice(0, -1).join('/') || props.root;
  load();
}
onMounted(load);
</script>
<template>
  <Modal :title="t('Move {n} item(s) to…', { n: count })" width="460px" @close="emit('close')">
    <div class="row" style="gap: 8px">
      <button class="btn ibtn sm" :disabled="at === root" :aria-label="t('Up one folder')" @click="up">
        <Icon name="left" :size="16" />
      </button>
      <b class="mono grow" style="overflow-wrap: anywhere">{{ at }} /</b>
    </div>
    <div class="fl">
      <button v-for="d in dirs" :key="d" class="btn clear fi" @click="into(d)">
        <Icon name="folder" :size="16" /><span class="grow">{{ d }}</span
        ><Icon name="chev" :size="14" />
      </button>
      <div v-if="!busy && !dirs.length" class="mu" style="font-size: 13px; padding: 6px">
        {{ t('No folders here.') }}
      </div>
    </div>
    <template #foot
      ><button class="btn lg" @click="emit('close')">{{ t('Cancel') }}</button
      ><button class="btn lg acc" @click="emit('pick', at)">{{ t('Move here') }}</button></template
    >
  </Modal>
</template>
<style scoped>
.fl {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--bd);
  border-radius: var(--rb);
  padding: 4px;
}
.fi {
  justify-content: flex-start;
  gap: 10px;
  height: 38px;
  color: var(--tx);
  text-align: left;
}
</style>
