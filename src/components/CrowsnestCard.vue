<script setup>
// Camera settings from crowsnest.conf as a form: one block per [cam N] with mode, port, device, resolution, fps and
// extra flags. Save writes the file (a backup is made first) and restarts crowsnest. Only these lines change;
// the rest of the file stays as it is. Shown when the config folder has a crowsnest.conf.
import { ref, onMounted, computed } from 'vue';
import Icon from './Icon.vue';
import { api } from '../api/moonraker';
import { toast, backupBeforeWrite, isPrinting } from '../store';
import { parseCrowsnest, writeCrowsnest, CAM_KEYS, REQUIRED_KEYS, MODES } from '../crowsnest';
import { t } from '../i18n';
const text = ref(null);
const cams = ref([]);
const missing = ref(false);
const saving = ref(false);
const open = ref(false);
async function load() {
  try {
    const raw = await api.getText('/server/files/config/crowsnest.conf');
    text.value = raw;
    cams.value = parseCrowsnest(raw.replace(/\r\n/g, '\n')).map((c) => ({
      ...c,
      opts: Object.fromEntries(CAM_KEYS.map((k) => [k, c.opts[k] ?? ''])),
    }));
    missing.value = false;
  } catch {
    missing.value = true;
  }
}
onMounted(load);
const dirty = computed(() => {
  if (!text.value) return false;
  const orig = parseCrowsnest(text.value.replace(/\r\n/g, '\n'));
  return cams.value.some((c) => {
    const o = orig.find((x) => x.name === c.name);
    return o && CAM_KEYS.some((k) => String(c.opts[k] ?? '').trim() !== (o.opts[k] ?? ''));
  });
});
async function save() {
  for (const c of cams.value) {
    for (const k of REQUIRED_KEYS)
      if (!String(c.opts[k] ?? '').trim())
        return toast(t('{key} is required, crowsnest does not start without it', { key: k }), 'warn');
    if (c.opts.port && !/^\d{2,5}$/.test(c.opts.port.trim())) return toast(t('Port must be a number'), 'warn');
    if (c.opts.resolution && !/^\d+x\d+$/i.test(c.opts.resolution.trim()))
      return toast(t('Resolution looks like 1280x720'), 'warn');
    for (const k of CAM_KEYS) if (/[\r\n]/.test(c.opts[k] || '')) return toast(t('One line per value'), 'warn');
  }
  saving.value = true;
  try {
    const crlf = text.value.includes('\r\n');
    let next = writeCrowsnest(text.value.replace(/\r\n/g, '\n'), cams.value);
    if (crlf) next = next.replace(/\n/g, '\r\n');
    await backupBeforeWrite('config', 'crowsnest.conf');
    await api.upload(new Blob([next], { type: 'text/plain' }), { root: 'config', name: 'crowsnest.conf' });
    await api.call('machine.services.restart', { service: 'crowsnest' }).catch(() => {});
    toast(t('crowsnest.conf saved, crowsnest restarts. The cameras come back in a few seconds.'));
    await load();
  } catch (e) {
    toast(e.message, 'error');
  }
  saving.value = false;
}
const RES = ['640x480', '800x600', '1280x720', '1920x1080', '2560x1440'];
</script>
<template>
  <section v-if="!missing" class="card">
    <div class="card-h">
      <h2>{{ t('Camera settings (crowsnest)') }}</h2>
      <div class="acts">
        <button class="btn clear ibtn sm" :aria-label="open ? t('Collapse') : t('Expand')" @click="open = !open">
          <Icon name="chev" :size="16" :stroke="2.4" :style="{ transform: open ? 'rotate(90deg)' : '' }" />
        </button>
      </div>
    </div>
    <template v-if="open">
      <div v-for="c in cams" :key="c.name" class="cam">
        <b class="mono">[cam {{ c.name }}]</b>
        <div class="grid">
          <label class="f"
            ><span>{{ t('Mode') }}</span
            ><select v-model="c.opts.mode" class="input">
              <option v-for="m in MODES" :key="m" :value="m">{{ m }}</option>
            </select></label
          >
          <label class="f"
            ><span>{{ t('Port') }}</span
            ><input v-model="c.opts.port" class="input mono" placeholder="8080"
          /></label>
          <label class="f" style="grid-column: 1 / -1"
            ><span>{{ t('Device') }}</span
            ><input v-model="c.opts.device" class="input mono" placeholder="/dev/video0 or /dev/v4l/by-id/…"
          /></label>
          <label class="f"
            ><span>{{ t('Resolution') }}</span
            ><input v-model="c.opts.resolution" class="input mono" list="cn-res" placeholder="1280x720"
          /></label>
          <datalist id="cn-res"><option v-for="r in RES" :key="r" :value="r"></option></datalist>
          <label class="f"
            ><span>{{ t('Max fps') }}</span
            ><input v-model="c.opts.max_fps" class="input mono" placeholder="15"
          /></label>
          <label class="f" style="grid-column: 1 / -1"
            ><span>{{ t('Extra flags') }}</span
            ><input v-model="c.opts.custom_flags" class="input mono" :placeholder="t('e.g. --format=MJPEG')"
          /></label>
          <label class="f" style="grid-column: 1 / -1"
            ><span>v4l2ctl</span
            ><input
              v-model="c.opts.v4l2ctl"
              class="input mono"
              :placeholder="t('e.g. focus_automatic_continuous=0,focus_absolute=30')"
          /></label>
        </div>
      </div>
      <div v-if="!cams.length" class="mu sm">{{ t('No [cam] sections in crowsnest.conf.') }}</div>
      <div class="row" style="justify-content: space-between; gap: 10px; flex-wrap: wrap">
        <span class="mu sm">{{ t('Saving restarts crowsnest; the streams drop for a moment.') }}</span>
        <div class="row" style="gap: 8px">
          <button class="btn" :disabled="!dirty" @click="load">{{ t('Discard') }}</button>
          <button
            class="btn acc"
            :disabled="!dirty || saving || isPrinting"
            :data-tip="isPrinting ? t('Not while printing') : null"
            @click="save"
          >
            <Icon name="save" :size="15" />{{ t('Save and restart crowsnest') }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
<style scoped>
.cam {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--s2);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
.f {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--mu);
  min-width: 0;
}
.f .input {
  height: 34px;
  font-size: 13px;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12.5px;
}
</style>
