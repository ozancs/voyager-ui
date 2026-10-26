<script setup>
// Camera settings from crowsnest.conf as a form: one block per [cam N] with mode, port, device, resolution, fps and
// extra flags. Save writes the file (a backup is made first) and restarts crowsnest. Only these lines change;
// the rest of the file stays as it is. Shown when the config folder has a crowsnest.conf.
import { ref, onMounted, computed } from 'vue';
import Icon from './Icon.vue';
import { api } from '../api/moonraker';
import { toast, backupBeforeWrite, isPrinting } from '../store';
import {
  parseCrowsnest,
  writeCrowsnest,
  CAM_KEYS,
  REQUIRED_KEYS,
  MODES,
  parseCamControls,
  parseV4l2ctl,
  v4l2ctlString,
} from '../crowsnest';
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

// ---------------------------------------------------------------- picture: the camera's own controls
// read from crowsnest.log (crowsnest lists them at start); a change goes into the camera's v4l2ctl line. With
// camera-streamer it is also sent to the running stream at once; ustreamer takes it on Save (crowsnest restarts).
const ctrls = ref(null); // { device: [controls] }, null until read
async function loadCtrls() {
  try {
    ctrls.value = parseCamControls(await api.getText('/server/files/logs/crowsnest.log'));
  } catch {
    ctrls.value = {};
  }
}
const ctrlsOf = (c) => ctrls.value?.[String(c.opts.device || '').trim()] || [];
const pic = ref({}); // cam name -> open
function valOf(c, k) {
  const set = parseV4l2ctl(c.opts.v4l2ctl);
  return k.name in set ? Number(set[k.name]) : k.value;
}
// the /webcam/ address of a crowsnest port as KIAUH and the installer set it up: 8080 -> /webcam/, 8081 -> /webcam2/
const camPath = (port) => {
  const n = Number(port) - 8079;
  return n >= 1 && n <= 9 ? `/webcam${n > 1 ? n : ''}/` : null;
};
let liveTm = {};
function setCtrl(c, k, v) {
  const o = parseV4l2ctl(c.opts.v4l2ctl);
  o[k.name] = String(v);
  c.opts.v4l2ctl = v4l2ctlString(o);
  if (c.opts.mode === 'camera-streamer' && camPath(c.opts.port)) {
    clearTimeout(liveTm[k.name]);
    liveTm[k.name] = setTimeout(() => {
      const u = api.url(
        camPath(c.opts.port) + `option?key=${encodeURIComponent(k.name)}&value=${encodeURIComponent(v)}`,
      );
      fetch(u, { method: 'POST' }).catch(() => {});
    }, 150);
  }
}
function resetCtrls(c) {
  const o = parseV4l2ctl(c.opts.v4l2ctl);
  for (const k of ctrlsOf(c)) if (k.def != null && k.name in o) o[k.name] = String(k.def);
  c.opts.v4l2ctl = v4l2ctlString(o);
}
function togglePic(c) {
  pic.value[c.name] = !pic.value[c.name];
  if (pic.value[c.name] && !ctrls.value) loadCtrls();
}
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
          <div class="pic" style="grid-column: 1 / -1">
            <button class="btn clear sm pt" :aria-expanded="!!pic[c.name]" @click="togglePic(c)">
              <Icon name="chev" :size="14" :style="{ transform: pic[c.name] ? 'rotate(90deg)' : '' }" />{{
                t('Picture (brightness, focus, exposure…)')
              }}
            </button>
            <template v-if="pic[c.name]">
              <span v-if="!ctrls" class="mu sm">{{ t('Loading…') }}</span>
              <span v-else-if="!ctrlsOf(c).length" class="mu sm">{{
                t(
                  'crowsnest.log does not list this camera’s controls. They are written at start with log_level: verbose; check the device path above.',
                )
              }}</span>
              <template v-else>
                <span class="mu sm">{{
                  c.opts.mode === 'camera-streamer'
                    ? t('Changes show on the stream at once; Save keeps them.')
                    : t('Changes are applied when you save (crowsnest restarts).')
                }}</span>
                <div v-for="k in ctrlsOf(c)" :key="k.name" class="ctl" :class="{ off: k.inactive }">
                  <span class="mono kn" :data-tip="k.inactive ? t('Not active while an automatic mode is on') : null">{{
                    k.name
                  }}</span>
                  <template v-if="k.type === 'bool'"
                    ><input
                      type="checkbox"
                      class="cb"
                      :checked="!!valOf(c, k)"
                      :aria-label="k.name"
                      @change="setCtrl(c, k, $event.target.checked ? 1 : 0)"
                  /></template>
                  <select
                    v-else-if="k.menu.length"
                    class="input"
                    :value="valOf(c, k)"
                    :aria-label="k.name"
                    @change="setCtrl(c, k, +$event.target.value)"
                  >
                    <option v-for="m in k.menu" :key="m.v" :value="m.v">{{ m.label }}</option>
                  </select>
                  <template v-else
                    ><input
                      class="rng"
                      type="range"
                      :min="k.min"
                      :max="k.max"
                      :step="k.step"
                      :value="valOf(c, k)"
                      :style="{ '--f': (valOf(c, k) - k.min) / (k.max - k.min || 1) }"
                      :aria-label="k.name"
                      @input="setCtrl(c, k, +$event.target.value)"
                    /><span class="mono v">{{ valOf(c, k) }}</span></template
                  >
                </div>
                <button class="btn sm" style="align-self: flex-start" @click="resetCtrls(c)">
                  {{ t('Back to the camera defaults') }}
                </button>
              </template>
            </template>
          </div>
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
.pic {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pt {
  align-self: flex-start;
  gap: 6px;
  padding-left: 2px;
}
.ctl {
  display: grid;
  grid-template-columns: minmax(110px, 38%) 1fr auto;
  gap: 10px;
  align-items: center;
  min-height: 30px;
  font-size: 12.5px;
}
.ctl.off {
  opacity: 0.5;
}
.ctl .kn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ctl select,
.ctl .cb {
  grid-column: 2 / -1;
  justify-self: start;
}
.ctl select {
  height: 30px;
  font-size: 12.5px;
}
.ctl .v {
  min-width: 42px;
  text-align: right;
}
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
