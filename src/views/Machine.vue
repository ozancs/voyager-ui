<script setup>
// Machine page: system loads, the file browser for config and logs, the update manager (with the
// confirm dialog that lists incoming commits) and endstop state.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import Icon from '../components/Icon.vue';
import Modal from '../components/Modal.vue';
import LogViewer from '../components/LogViewer.vue';
import BackupCard from '../components/BackupCard.vue';
import UsersCard from '../components/UsersCard.vue';
import MacroVars from '../components/MacroVars.vue';
import SystemLoads from '../components/SystemLoads.vue';
import FileBrowser from '../components/FileBrowser.vue';
import { state, S, gcode, toast, fmtBytes, useApiEvent, applyUpd, restartKlipper } from '../store';
import { api } from '../api/moonraker';
import { macroVars } from '../features';
import { t } from '../i18n';
const C = (state.cache.machine ||= {});
const sys = ref(C.sys || null),
  proc = ref(C.proc || null),
  upd = ref(C.upd || null),
  ends = ref(null);
const busy = ref(''),
  confirm = ref(null);
async function loadSys() {
  try {
    sys.value = C.sys = (await api.call('machine.system_info')).system_info;
  } catch {}
}
async function loadProc() {
  try {
    proc.value = C.proc = await api.call('machine.proc_stats');
  } catch {}
}
async function loadUpd(refresh = false) {
  if (busy.value && busy.value !== 'check')
    refresh = false; // an update is running: only read the status
  else busy.value = refresh ? 'check' : '';
  try {
    let r;
    if (refresh) {
      try {
        r = await api.call('machine.update.refresh', {});
      } catch {
        r = await api.call('machine.update.status', { refresh: true });
      }
    } else r = await api.call('machine.update.status', {});
    upd.value = C.upd = r;
    applyUpd(r); // also clears the side menu hint and the notification
  } catch (e) {
    if (refresh) toast(e.message, 'error');
  }
  if (busy.value === 'check' || !busy.value) busy.value = '';
}
async function query() {
  try {
    ends.value = await api.call('printer.query_endstops.status');
  } catch (e) {
    toast(e.message, 'error');
  }
}
let tmr;
onMounted(() => {
  loadUpd();
});
// fresh status pushed by Moonraker (after a check or an update) or read by the periodic check
watch(
  () => state.updStatus,
  (u) => {
    if (u?.version_info) upd.value = C.upd = u;
  },
);
onBeforeUnmount(() => clearInterval(tmr));
useApiEvent('notify_proc_stat_update', ([p]) => {
  if (proc.value)
    Object.assign(proc.value, {
      cpu_temp: p.cpu_temp,
      system_cpu_usage: p.system_cpu_usage,
      system_memory: p.system_memory ?? proc.value.system_memory,
    });
});
const cpu = computed(() => proc.value?.system_cpu_usage?.cpu ?? null);
const mem = computed(() => proc.value?.system_memory);
const mcus = computed(() => state.objects.filter((o) => o === 'mcu' || o.startsWith('mcu ')));
const updates = computed(() => Object.entries(upd.value?.version_info || {}).filter(([k]) => k !== 'system'));
const updateGroups = computed(() => {
  const attention = [];
  const current = [];
  for (const entry of Object.entries(upd.value?.version_info || {})) {
    const [, info] = entry;
    (needs(info) || info.is_dirty || info.detached || info.is_valid === false ? attention : current).push(entry);
  }
  // OznLab's own (Voyager UI, PA Sensei, Phoenix) first, then the rest in Moonraker's order
  const own = ([k]) => (/^(voyager-ui|pa[_-]sensei|oznlab|phoenix)/i.test(k) ? 0 : 1);
  const order = (l) =>
    l
      .map((e, i) => [e, i])
      .sort((a, b) => own(a[0]) - own(b[0]) || a[1] - b[1])
      .map((x) => x[0]);
  return [
    { id: 'attention', entries: order(attention) },
    { id: 'current', entries: order(current) },
  ];
});
// the system packages Moonraker would update (apt / PackageKit), listed under the System row and in its dialog
const pkgs = computed(() => {
  const l = upd.value?.version_info?.system?.package_list;
  return Array.isArray(l) ? l.filter((p) => typeof p === 'string') : [];
});
const showPkgs = ref(false);
function needs(v) {
  if (v.package_count) return v.package_count > 0;
  if (v.commits_behind?.length) return true;
  if (v.version && v.remote_version && v.remote_version !== '?' && v.version !== v.remote_version) return true;
  return false;
}
// the update dialog: what changes, a link to look at it on GitHub, and an "I understand the risk" tick
const risk = ref(false);
watch(
  () => confirm.value,
  () => (risk.value = false),
);
const cv = computed(() =>
  confirm.value && confirm.value !== '__all' ? upd.value?.version_info?.[confirm.value] || {} : null,
);
const ghBase = (v) => {
  if (v.owner && v.repo_name && v.owner !== '?') return `https://github.com/${v.owner}/${v.repo_name}`;
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(v.remote_url || '');
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
};
const ghLink = computed(() => {
  const v = cv.value;
  if (!v) return null;
  const b = ghBase(v);
  if (!b) return null;
  if (v.current_hash && v.remote_hash && v.current_hash !== v.remote_hash)
    return b + '/compare/' + v.current_hash + '...' + v.remote_hash;
  if (v.configured_type === 'web') return b + '/releases';
  return b;
});
const commits = computed(() =>
  Array.isArray(cv.value?.commits_behind)
    ? cv.value.commits_behind.filter((c) => c && typeof c === 'object').slice(0, 30)
    : [],
);
const fmtC = (c) => (c.date ? new Date(+c.date * 1000).toLocaleDateString() : '');
function verText(v) {
  return v.version || v.full_version_string || '';
}
async function doUpdate(name) {
  confirm.value = null;
  busy.value = name;
  state.update = { app: name, lines: [], complete: false };
  try {
    try {
      await api.call('machine.update.upgrade', { name });
    } catch (e) {
      // Moonraker older than 0.8 (stock QIDI and similar) has no upgrade method: use the older per-type ones
      if (e.code !== -32601 && !/method not found/i.test(e.message)) throw e;
      if (name === 'klipper' || name === 'moonraker' || name === 'system') await api.call('machine.update.' + name, {});
      else await api.call('machine.update.client', { name });
    }
  } catch (e) {
    if (state.update) {
      state.update.lines.push('!! ' + e.message);
      state.update.complete = true;
    }
  }
  busy.value = '';
  loadUpd();
}
// Moonraker keeps the version a component had before its last update (rollback_version): one step back
const canRollback = (v) =>
  !!v.rollback_version &&
  v.rollback_version !== '?' &&
  v.rollback_version !== verText(v) &&
  v.rollback_version !== v.remote_version && // just rolled back: the update button brings it forward again
  !v.is_dirty;
const anyRollback = computed(() => updates.value.some(([, v]) => canRollback(v)));
const rb = ref(null); // name of the component to roll back
const rbRisk = ref(false);
watch(rb, () => (rbRisk.value = false));
async function doRollback(name) {
  rb.value = null;
  busy.value = name;
  state.update = { app: name, lines: [], complete: false };
  try {
    await api.call('machine.update.rollback', { name });
  } catch (e) {
    if (state.update) {
      state.update.lines.push('!! ' + e.message);
      state.update.complete = true;
    }
  }
  busy.value = '';
  loadUpd();
}
async function doUpdateAll() {
  confirm.value = null;
  busy.value = 'all';
  state.update = { app: 'all', lines: [], complete: false };
  try {
    await api.call('machine.update.full');
  } catch (e) {
    if (state.update) {
      state.update.lines.push('!! ' + e.message);
      state.update.complete = true;
    }
  }
  busy.value = '';
  loadUpd();
}
const logs = ['klippy.log', 'moonraker.log', 'crowsnest.log'];
const hasVars = computed(() =>
  state.objects.some((o) => o.startsWith('gcode_macro ') && Object.keys(macroVars(o.slice(12))).length),
);
const viewLog = ref(null);
</script>
<template>
  <div class="mg">
    <div class="left"><FileBrowser class="fb" /></div>
    <div class="col" style="gap: 16px">
      <SystemLoads detailed />
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Update Manager') }}</h2>
          <div class="acts">
            <button
              v-if="updates.filter(([, v]) => needs(v)).length > 1"
              class="btn upb"
              :disabled="!!busy"
              @click="confirm = '__all'"
            >
              <Icon name="download" :size="16" />{{ t('Update all') }}</button
            ><button class="btn" :disabled="!!busy" @click="loadUpd(true)">
              <Icon name="refresh" :size="16" />{{ busy === 'check' ? t('Checking…') : t('Check') }}
            </button>
          </div>
        </div>
        <div v-if="!upd" class="empty">{{ t('Loading…') }}</div>
        <template v-for="group in updateGroups" :key="group.id">
          <component
            :is="group.id === 'current' ? 'details' : 'div'"
            v-if="group.entries.length"
            :class="{ 'current-updates': group.id === 'current' }"
          >
            <summary v-if="group.id === 'current'">
              <span>{{ t('Up to date') }}</span>
              <span class="chip">{{ group.entries.length }}</span>
            </summary>
            <div :class="{ 'current-grid': group.id === 'current' }">
              <template v-for="[name, v] in group.entries" :key="name"
                ><div :id="'upd-' + name" class="it">
                  <div class="grow update-info">
                    <b>{{ name === 'system' ? t('System') : name }}</b
                    ><button
                      v-if="name === 'system' && pkgs.length"
                      class="pkt mono mu"
                      :aria-expanded="showPkgs"
                      @click="showPkgs = !showPkgs"
                    >
                      <Icon
                        name="chev"
                        :size="12"
                        :stroke="2.4"
                        :style="{ transform: showPkgs ? 'rotate(90deg)' : '' }"
                      />{{ t('{n} packages can be updated', { n: v.package_count }) }}</button
                    ><span
                      v-else
                      class="mono mu"
                      style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
                      >{{ name === 'system' ? t('{n} packages', { n: v.package_count }) : verText(v)
                      }}<template v-if="name !== 'system' && needs(v)"> → {{ v.remote_version }}</template
                      ><template v-if="v.is_dirty"> · {{ t('dirty') }}</template
                      ><template v-if="v.detached"> · {{ t('detached') }}</template></span
                    >
                  </div>
                  <!-- roll back sits left of the status, in a slot every row keeps so the status buttons line up -->
                  <span
                    v-if="name !== 'system' && anyRollback && (group.id === 'attention' || canRollback(v))"
                    class="rbs"
                    ><button
                      v-if="canRollback(v)"
                      class="btn clear ibtn sm"
                      :disabled="!!busy"
                      :aria-label="t('Roll back to {v}', { v: v.rollback_version })"
                      :data-tip="t('Roll back to {v}', { v: v.rollback_version })"
                      @click="rb = name"
                    >
                      <Icon name="rewind" :size="16" /></button
                  ></span>
                  <button v-if="needs(v)" class="btn upb" :disabled="!!busy" @click="confirm = name">
                    <Icon name="download" :size="16" />{{ busy === name ? t('Updating…') : t('Update') }}
                  </button>
                  <span
                    v-else-if="group.id === 'attention'"
                    class="chip"
                    :style="{ color: v.detached || v.is_dirty ? 'var(--wn)' : 'var(--mu)' }"
                    ><i></i
                    >{{
                      v.detached
                        ? t('Pinned')
                        : v.is_dirty
                          ? t('dirty')
                          : v.is_valid === false
                            ? t('Invalid')
                            : t('Up to date')
                    }}</span
                  >
                </div>
                <div v-if="name === 'system' && showPkgs && pkgs.length" class="cl pkl mono">
                  <span v-for="p in pkgs" :key="p">{{ p }}</span>
                </div></template
              >
            </div>
          </component>
        </template>
      </section>
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Endstops') }}</h2>
          <button class="btn" @click="query"><Icon name="refresh" :size="16" />{{ t('Query') }}</button>
        </div>
        <div v-if="!ends" class="mu" style="font-size: 13px">{{ t('Press query to read endstop states.') }}</div>
        <div v-for="(v, k) in ends" :key="k" class="row sb" style="height: 30px">
          <span class="mono">{{ k }}</span
          ><span class="chip" :style="{ color: v === 'open' ? 'var(--mu)' : 'var(--tx)' }"><i></i>{{ t(v) }}</span>
        </div>
      </section>
      <section class="card">
        <div class="card-h">
          <h2>{{ t('Logs') }}</h2>
          <button class="btn" @click="restartKlipper(true)">
            <Icon name="restart" :size="16" />{{ t('Firmware restart') }}
          </button>
        </div>
        <div v-for="l in logs" :key="l" class="row" style="height: 40px">
          <Icon name="file" :size="16" style="color: var(--mu)" /><span class="mono grow">{{ l }}</span
          ><button class="btn" @click="viewLog = l"><Icon name="eye" :size="15" />{{ t('View') }}</button
          ><a
            class="btn ibtn sm clear"
            :href="api.url('/server/files/logs/' + l)"
            download
            :aria-label="t('Download {f}', { f: l })"
            ><Icon name="download" :size="16"
          /></a>
        </div>
      </section>
      <section v-if="hasVars" class="card">
        <div class="card-h">
          <h2>{{ t('Macro variables') }}</h2>
        </div>
        <MacroVars />
      </section>
      <BackupCard />
      <UsersCard />
    </div>
  </div>
  <LogViewer v-if="viewLog" :file="viewLog" @close="viewLog = null" />
  <Modal v-if="rb" :title="t('Roll back {name}?', { name: rb })" @close="rb = null">
    <div class="row mono" style="gap: 8px; font-size: 13px">
      <span>{{ verText(upd?.version_info?.[rb] || {}) }}</span
      ><Icon name="right" :size="14" /><b>{{ upd?.version_info?.[rb]?.rollback_version }}</b>
    </div>
    <p class="mu" style="margin: 0">
      {{
        t(
          'Goes back to the version it had before its last update. Use it when an update broke something; the next update brings the new version again.',
        )
      }}
    </p>
    <label class="row" style="gap: 10px; cursor: pointer"
      ><input v-model="rbRisk" type="checkbox" class="cb" /><span>{{ t('I understand the risk') }}</span></label
    >
    <template #foot
      ><button class="btn lg" @click="rb = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" :disabled="!rbRisk" @click="doRollback(rb)">{{ t('Roll back') }}</button></template
    >
  </Modal>
  <Modal
    v-if="confirm"
    :title="confirm === '__all' ? t('Update everything?') : t('Update {name}?', { name: confirm })"
    @close="confirm = null"
  >
    <div v-if="cv && (verText(cv) || cv.remote_version)" class="row mono" style="gap: 8px; font-size: 13px">
      <span>{{ verText(cv) }}</span
      ><Icon name="right" :size="14" /><b>{{ cv.remote_version || '?' }}</b
      ><span v-if="cv.commits_behind?.length" class="mu"
        >· {{ t('{n} commits', { n: cv.commits_behind.length }) }}</span
      >
    </div>
    <template v-if="confirm === 'system' && pkgs.length">
      <div class="mu" style="font-size: 13px">{{ t('{n} packages can be updated', { n: pkgs.length }) }}</div>
      <div class="cl pkl mono">
        <span v-for="p in pkgs" :key="p">{{ p }}</span>
      </div>
    </template>
    <div v-if="commits.length" class="cl">
      <div v-for="c in commits" :key="c.sha" class="ci">
        <span class="grow">{{ c.subject }}</span
        ><span class="mu mono">{{ c.author }} · {{ fmtC(c) }}</span>
      </div>
    </div>
    <a v-if="ghLink" :href="ghLink" target="_blank" rel="noopener" class="row" style="gap: 6px; font-size: 13px"
      ><Icon name="ext" :size="15" />{{ t('See the changes on GitHub') }}</a
    >
    <p v-if="cv?.is_dirty" class="wn" style="margin: 0; font-size: 13px">
      {{ t('This repo has local changes. The update may overwrite them.') }}
    </p>
    <p class="mu" style="margin: 0">
      {{
        t(
          'Updates can change how things work or break them. Services restart during the update, do not update while printing, and keep a backup of your config.',
        )
      }}
    </p>
    <label class="row" style="gap: 10px; cursor: pointer"
      ><input v-model="risk" type="checkbox" class="cb" /><span>{{ t('I understand the risk') }}</span></label
    >
    <template #foot
      ><button class="btn lg" @click="confirm = null">{{ t('Cancel') }}</button
      ><button class="btn lg acc" :disabled="!risk" @click="confirm === '__all' ? doUpdateAll() : doUpdate(confirm)">
        {{ t('Update') }}
      </button></template
    >
  </Modal>
</template>
<style scoped>
.mg {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}
.left {
  position: relative;
  min-height: 520px;
}
.left .fb {
  position: absolute;
  inset: 0;
}
.sb {
  justify-content: space-between;
}
.m {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.m b {
  font-size: 13px;
}
.mu {
  color: var(--mu);
}
.rbs {
  width: 32px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}
.current-updates summary {
  cursor: pointer;
  padding: 8px 0;
  font-weight: 600;
}
.current-updates summary .chip {
  margin-inline-start: 8px;
}
/* Closed details content can still report bounds in Chromium. Remove it from layout. */
.current-updates:not([open]) .current-grid {
  display: none;
}
.current-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  column-gap: 16px;
}
.current-grid .it {
  min-height: 34px;
  border-bottom: 1px solid var(--bd);
}
.update-info {
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
}
.update-info b {
  white-space: normal;
  overflow-wrap: anywhere;
}
.it > .chip,
.it > .upb {
  min-width: 112px;
  justify-content: center;
}
.it {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--bd);
  min-height: 40px;
}
.it:last-child {
  border-bottom: none;
}
.it b {
  font-weight: 600;
  font-size: 13.5px;
  overflow-wrap: anywhere;
}
:root.ew-lt-1200 .mg {
  grid-template-columns: minmax(0, 1fr);
}
:root.ew-lt-1200 .left {
  min-height: 600px;
}
.cl {
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--s2);
  border-radius: 10px;
  padding: 6px 10px;
}
.pkl {
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 8px;
}
.pkt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--mu);
}
.pkt:hover {
  color: var(--tx);
}
.ci {
  display: flex;
  gap: 12px;
  font-size: 12.5px;
  padding: 4px 0;
  border-bottom: 1px solid var(--bd);
}
.ci:last-child {
  border-bottom: none;
}
.ci .mono {
  font-size: 11px;
  white-space: nowrap;
}
.wn {
  color: var(--wn);
}
/* an available update is the one place on this page that should catch the eye */
.btn.upb {
  background: color-mix(in srgb, var(--ac) 18%, var(--s2));
  /* the accent pulled toward the text colour: still reads as the accent, with enough contrast on its tint */
  color: color-mix(in srgb, var(--ac) 55%, var(--tx));
}
.btn.upb:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ac) 28%, var(--s2));
}
</style>
