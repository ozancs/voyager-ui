<script setup>
// Reads the tail of a printer log (klippy.log, moonraker.log, crowsnest.log) in the browser: the last part of the
// file is fetched with a Range request, errors and warnings are highlighted, a filter narrows the lines, and
// "Follow" reloads every few seconds. The whole file is still a download away.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { api } from '../api/moonraker';
import { fmtBytes } from '../store';
import { t } from '../i18n';
const props = defineProps({ file: String });
const emit = defineEmits(['close']);
const SIZES = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024];
const size = ref(SIZES[0]);
const total = ref(0);
const text = ref('');
const loading = ref(false);
const err = ref('');
const q = ref('');
const onlyProblems = ref(false);
const follow = ref(false);
const box = ref(null);
async function load() {
  loading.value = true;
  err.value = '';
  try {
    const path = `/server/files/logs/${encodeURIComponent(props.file)}`;
    const r = await api.fetch(path, { headers: { Range: `bytes=-${size.value}` } });
    if (!r.ok && r.status !== 206) throw new Error(`${r.status} ${r.statusText}`);
    const cr = r.headers.get('Content-Range'); // bytes a-b/total
    total.value = cr ? +cr.split('/')[1] || 0 : +(r.headers.get('Content-Length') || 0);
    let s = await r.text();
    if (r.status === 206 && total.value > size.value) s = s.slice(s.indexOf('\n') + 1); // drop the cut first line
    text.value = s;
    requestAnimationFrame(() => box.value && (box.value.scrollTop = box.value.scrollHeight));
  } catch (e) {
    err.value = e.message;
  }
  loading.value = false;
}
watch(size, load);
load();
let tm = null;
watch(follow, (on) => {
  clearInterval(tm);
  if (on) tm = setInterval(load, 4000);
});
onBeforeUnmount(() => clearInterval(tm));
// a line's kind: the words Klipper and Moonraker use for trouble
const kind = (l) =>
  /\b(error|exception|traceback|shutdown|failed|timeout|lost communication|mcu '.*?' shutdown)\b/i.test(l)
    ? 'err'
    : /\b(warn|warning|retransmit|stats .* bytes_retransmit=[1-9])\b/i.test(l)
      ? 'warn'
      : '';
const lines = computed(() => {
  const all = text.value.split('\n');
  const s = q.value.trim().toLowerCase();
  return all
    .map((l, i) => ({ i, l, k: kind(l) }))
    .filter((x) => (!s || x.l.toLowerCase().includes(s)) && (!onlyProblems.value || x.k))
    .slice(-4000); // the browser, not the log, is the limit
});
const counts = computed(() => {
  let e = 0,
    w = 0;
  for (const l of text.value.split('\n')) {
    const k = kind(l);
    if (k === 'err') e++;
    else if (k === 'warn') w++;
  }
  return { e, w };
});
</script>
<template>
  <Modal :title="file" width="min(1100px, 96vw)" @close="emit('close')">
    <div class="lv">
      <div class="lvbar">
        <input v-model="q" class="input" :placeholder="t('Filter lines…')" style="flex: 1; min-width: 160px" />
        <button class="btn" :class="{ on: onlyProblems }" @click="onlyProblems = !onlyProblems">
          <Icon name="warn" :size="15" />{{ t('Problems only') }}
          <span class="mono mu" style="font-size: 11px">{{ counts.e }} / {{ counts.w }}</span>
        </button>
        <div class="seg" style="width: 200px">
          <button v-for="s in SIZES" :key="s" :class="{ on: size === s }" @click="size = s">{{ fmtBytes(s) }}</button>
        </div>
        <button class="btn" :class="{ on: follow }" @click="follow = !follow">
          <Icon name="refresh" :size="15" :class="{ spin: follow }" />{{ t('Follow') }}
        </button>
        <button class="btn clear ibtn sm" :aria-label="t('Reload')" :disabled="loading" @click="load">
          <Icon name="refresh" :size="16" />
        </button>
        <a class="btn" :href="api.url('/server/files/logs/' + file)" download
          ><Icon name="download" :size="15" />{{ t('Download') }}</a
        >
      </div>
      <div v-if="err" class="mu" style="color: var(--dg)">{{ err }}</div>
      <pre ref="box" class="log">
        <template v-for="x in lines" :key="x.i"><span :class="x.k">{{ x.l }}</span>
</template>
      </pre>
      <span class="mu" style="font-size: 12px">
        {{
          total ? t('Last {part} of {total}', { part: fmtBytes(Math.min(size, total)), total: fmtBytes(total) }) : ''
        }}
        <template v-if="q || onlyProblems"> · {{ t('{n} lines match', { n: lines.length }) }}</template>
      </span>
    </div>
  </Modal>
</template>
<style scoped>
.lv {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lvbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.log {
  margin: 0;
  height: 60vh;
  overflow: auto;
  background: var(--bg);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre;
}
.log span {
  display: block;
}
.log .err {
  color: var(--dg);
}
.log .warn {
  color: var(--wn);
}
.mu {
  color: var(--mu);
}
.spin {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
