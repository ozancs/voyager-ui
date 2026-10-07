<script setup>
// Input shaper graphs through gcode_shell_command: when the config has a macro that runs RUN_SHELL_COMMAND with a
// command calling calibrate_shaper.py or graph_shaper.py (the usual "generate shaper graphs" macros), a button runs
// it here and the PNGs it writes into the config folder show up below. Nothing is installed by this UI: without
// such a macro it says what is needed.
import { ref, computed, onMounted } from 'vue';
import Icon from './Icon.vue';
import ImageViewer from './ImageViewer.vue';
import { state, S, gcode, toast, useApiEvent } from '../store';
import { api } from '../api/moonraker';
import { t } from '../i18n';
const cfg = computed(() => S('configfile').config || {});
// gcode_shell_command sections whose command draws shaper graphs
const shellCmds = computed(() =>
  Object.entries(cfg.value)
    .filter(([k, v]) => /^gcode_shell_command /i.test(k) && /shaper|resonance/i.test(v.command || ''))
    .map(([k]) => k.slice(19).trim()),
);
// macros that run one of them (RUN_SHELL_COMMAND CMD=xxx), or the shell commands themselves
const macros = computed(() => {
  const out = [];
  for (const [k, v] of Object.entries(cfg.value)) {
    if (!/^gcode_macro /i.test(k)) continue;
    const g = String(v.gcode || '');
    const m = /RUN_SHELL_COMMAND\s+CMD=(\w+)/i.exec(g);
    if (m && shellCmds.value.some((c) => c.toLowerCase() === m[1].toLowerCase())) out.push(k.slice(12).trim());
  }
  return out;
});
const has = computed(() => shellCmds.value.length > 0);
const running = ref('');
async function runMacro(m) {
  running.value = m;
  try {
    await gcode(m);
    toast(t('{name} started. The graphs appear below when they are written.', { name: m }));
  } catch (e) {
    toast(e.message, 'error');
  }
  setTimeout(() => (running.value = ''), 3000);
}
async function runShell(c) {
  await runMacro(`RUN_SHELL_COMMAND CMD=${c}`);
}
// PNGs in the config root that look like shaper graphs, newest first
const images = ref([]);
async function load() {
  try {
    const r = await api.call('server.files.list', { root: 'config' });
    images.value = r
      .filter(
        (f) =>
          /\.png$/i.test(f.path) && /shaper|resonances|calibration_data|belt/i.test(f.path) && !f.path.includes('/'),
      )
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 12);
  } catch {
    images.value = [];
  }
}
onMounted(load);
let tm;
useApiEvent('notify_filelist_changed', ([p]) => {
  if (p?.item?.root === 'config' && /\.png$/i.test(p.item.path || '')) {
    clearTimeout(tm);
    tm = setTimeout(load, 800);
  }
});
const url = (f) => api.fileUrl('config', f.path, 'm=' + Math.round(f.modified));
const viewer = ref(null);
const fmt = (ts) =>
  new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>
<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ t('Graphs') }}</h2>
      <div v-if="has" class="acts">
        <button v-for="m in macros" :key="m" class="btn" :disabled="!!running" @click="runMacro(m)">
          <Icon name="wave" :size="15" />{{ m.replace(/_/g, ' ') }}
        </button>
        <template v-if="!macros.length">
          <button v-for="c in shellCmds" :key="c" class="btn" :disabled="!!running" @click="runShell(c)">
            <Icon name="wave" :size="15" />{{ c.replace(/_/g, ' ') }}
          </button>
        </template>
      </div>
    </div>
    <p v-if="!has" class="mu sm" style="margin: 0">
      {{
        t(
          'Klipper writes the raw data to /tmp; drawing the graph takes a gcode_shell_command (the shell command extension) whose command runs calibrate_shaper.py and writes a PNG into the config folder. Once such a macro is in the config, it shows up here as a button.',
        )
      }}
    </p>
    <template v-else>
      <div v-if="!images.length" class="mu sm">{{ t('No graphs in the config folder yet.') }}</div>
      <div class="imgs">
        <button v-for="f in images" :key="f.path" class="im" @click="viewer = f.path">
          <img :src="url(f)" :alt="f.path" loading="lazy" />
          <span class="mono">{{ f.path.replace(/\.png$/i, '') }}</span>
          <span class="mu">{{ fmt(f.modified) }}</span>
        </button>
      </div>
    </template>
    <ImageViewer v-if="viewer" :list="images.map((i) => i.path)" :start="viewer" @close="viewer = null" />
  </section>
</template>
<style scoped>
.imgs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.im {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--tx);
  text-align: left;
  font-size: 12px;
}
.im img {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 8px;
  background: #fff;
}
.im .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12.5px;
}
</style>
