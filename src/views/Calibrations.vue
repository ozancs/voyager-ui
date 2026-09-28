<script setup>
// Calibrations page: the interactive calibration path on top (CalibPath.vue), then one tab per kind of calibration the printer has (Shake&Tune, input shaper, heaters, probe,
// bed leveling, motors, other). The command lists are in calibrations.js. A tab runs the chosen command with
// its parameters, follows its console output and shows the numbers that matter. Values Klipper keeps for
// SAVE_CONFIG (PID, shaper) can be saved from here; the Shake&Tune tab is its own page (ShakeTune.vue).
import { ref, computed, watchEffect } from 'vue';
import Icon from '../components/Icon.vue';
import ShakeTune from './ShakeTune.vue';
import CalibPath from '../components/CalibPath.vue';
import { state, S, gcode, toast, isPrinting } from '../store';
import { availableGroups, buildCommand, missingParams, parseResult } from '../calibrations';
import { route, go } from '../router';
import { t } from '../i18n';

const groups = computed(() => availableGroups(state.commands));
const tab = computed(() => groups.value.find((g) => g.key === route.arg) || groups.value[0] || null);
const setTab = (k) => go('calibrations', k);

// the chosen command per tab, and the typed values per command
const chosen = ref({});
const item = computed(() => {
  const g = tab.value;
  if (!g || !g.items.length) return null;
  return g.items.find((i) => i.cmd === chosen.value[g.key]) || g.items[0];
});
const vals = ref({});
const extra = ref({});
const v = computed(() => (vals.value[item.value?.cmd] ||= {}));
const ctx = computed(() => ({ status: state.status, objects: state.objects || [] }));
// params shown for the chosen command (SENSOR= only when there is more than one OznLab Sensor)
const shown = computed(() => (item.value?.params || []).filter((p) => !p.onlyWithOpts || p.opts(ctx.value).length));
// a needed parameter with a list (HEATER, CHIP...) starts at the first choice
watchEffect(() => {
  for (const p of shown.value)
    if (p.req && p.opts && !v.value[p.k]) {
      const first = p.opts(ctx.value).find(Boolean);
      if (first) v.value[p.k] = first;
    }
});
const cmdLine = computed(() => (item.value ? buildCommand(item.value, v.value, extra.value[item.value.cmd]) : ''));
const missing = computed(() => (item.value ? missingParams(item.value, v.value) : []));
const homed = computed(() => ['x', 'y', 'z'].every((a) => (S('toolhead').homed_axes || '').includes(a)));
const savePending = computed(() => S('configfile').save_config_pending);

// running: remember where the console was, then read what came after
const runs = ref({}); // per tab: { cmd, line, since, running }
const run = computed(() => runs.value[tab.value?.key] || null);
async function start() {
  const since = state.console.length ? state.console[state.console.length - 1].id : 0;
  const key = tab.value.key,
    line = cmdLine.value;
  runs.value[key] = { cmd: item.value.cmd, line, since, running: true };
  try {
    await gcode(line);
  } catch (e) {
    toast(e.message, 'error');
  }
  if (runs.value[key]) runs.value[key].running = false;
}
const strip = (m) => String(m || '').replace(/^\/\/\s?/gm, '');
const runLines = computed(() =>
  run.value
    ? state.console.filter((l) => l.id > run.value.since && l.type !== 'command').map((l) => strip(l.message))
    : [],
);
const result = computed(() => (run.value ? parseResult(run.value.cmd, runLines.value) : { rows: [], shapers: [] }));
function applyShaper(r) {
  const A = r.axis.toUpperCase();
  gcode(`SET_INPUT_SHAPER SHAPER_TYPE_${A}=${r.type} SHAPER_FREQ_${A}=${r.freq}`);
  toast(t('Input shaper {axis} set until Klipper restarts', { axis: A }));
}
</script>

<template>
  <div class="cal">
    <CalibPath />
    <div v-if="groups.length" class="seg tabs" role="tablist">
      <button
        v-for="g in groups"
        :key="g.key"
        role="tab"
        :aria-selected="tab?.key === g.key"
        :class="{ on: tab?.key === g.key }"
        @click="setTab(g.key)"
      >
        <Icon :name="g.icon" :size="15" />{{ t(g.name) }}
      </button>
    </div>
    <div v-else class="card empty">{{ t('No calibration commands found on this printer.') }}</div>

    <ShakeTune v-if="tab?.key === 'shaketune'" />

    <div v-else-if="tab" class="split">
      <section class="card grow">
        <div class="card-h">
          <h2>{{ t(tab.name) }}</h2>
        </div>
        <div class="items">
          <button
            v-for="i in tab.items"
            :key="i.cmd"
            class="it"
            :class="{ on: item?.cmd === i.cmd }"
            @click="chosen[tab.key] = i.cmd"
          >
            <b>{{ i.free ? i.name : t(i.name) }}</b>
            <span v-if="!i.free" class="mono sm mu">{{ i.cmd }}</span>
            <span v-if="i.desc" class="sm mu">{{ i.free ? i.desc : t(i.desc) }}</span>
          </button>
        </div>
      </section>

      <div class="side-col">
        <section v-if="item" class="card">
          <div class="card-h">
            <h2>{{ item.free ? item.name : t(item.name) }}</h2>
          </div>
          <div v-if="shown.length || item.free" class="params">
            <label v-for="p in shown" :key="item.cmd + p.k" class="pr">
              <span class="mono">{{ p.k }}<i v-if="p.req" class="mu">*</i></span>
              <select v-if="p.opts && p.opts(ctx).length" v-model="v[p.k]" class="input mono" :aria-label="p.k">
                <option v-if="!p.req" value="">{{ p.def || t('default') }}</option>
                <option v-for="o in p.opts(ctx).filter(Boolean)" :key="o" :value="o">{{ o }}</option>
              </select>
              <input
                v-else
                v-model="v[p.k]"
                class="input mono"
                :placeholder="p.def || t('default')"
                spellcheck="false"
                :aria-label="p.k"
              />
              <span class="mu sm">{{ p.hint }}</span>
            </label>
            <label v-if="item.free" class="pr wide">
              <span class="mu sm">{{ t('Parameters') }}</span>
              <input
                v-model="extra[item.cmd]"
                class="input mono"
                placeholder="KEY=value"
                spellcheck="false"
                :aria-label="t('Parameters')"
              />
            </label>
          </div>
          <code class="cl">{{ cmdLine }}</code>
          <div v-if="item.home && !homed" class="warnrow sm">
            <span class="mu">{{ t('The printer is not homed.') }}</span>
            <button class="btn" :disabled="isPrinting" @click="gcode('G28')">
              <Icon name="home" :size="16" />{{ t('Home all') }}
            </button>
          </div>
          <button class="btn lg acc" :disabled="isPrinting || run?.running || missing.length > 0" @click="start">
            <Icon :name="run?.running ? 'refresh' : 'play'" :class="{ spin: run?.running }" :size="18" />{{
              run?.running ? t('Running…') : t('Run')
            }}
          </button>
          <p v-if="missing.length" class="mu sm" style="margin: 0">
            {{ t('Fill in: {list}', { list: missing.join(', ') }) }}
          </p>
        </section>

        <section v-if="run" class="card">
          <div class="card-h">
            <h2>{{ t('Result') }}</h2>
            <span class="mono mu sm">{{ run.cmd }}</span>
          </div>
          <div v-for="(r, i) in result.shapers" :key="'s' + i" class="rec">
            <div class="grow">
              <b class="mono">{{ r.axis.toUpperCase() }} · {{ r.type.toUpperCase() }} @ {{ r.freq }} Hz</b>
              <span v-if="r.maxAccel" class="mu sm">max_accel ≤ {{ r.maxAccel }}</span>
            </div>
            <button class="btn" :data-tip="t('SET_INPUT_SHAPER, until Klipper restarts')" @click="applyShaper(r)">
              {{ t('Apply') }}
            </button>
          </div>
          <table v-if="result.rows.length" class="rows">
            <tr v-for="(r, i) in result.rows" :key="i">
              <td class="mu">{{ r[0] }}</td>
              <td class="mono">{{ r[1] }}</td>
            </tr>
          </table>
          <pre class="log">{{ runLines.slice(-14).join('\n') || (run.running ? t('Waiting for output…') : '') }}</pre>
        </section>

        <section v-if="savePending" class="card">
          <p class="sm" style="margin: 0">{{ t('Klipper has new values waiting for SAVE_CONFIG.') }}</p>
          <button class="btn lg" :disabled="isPrinting" @click="gcode('SAVE_CONFIG')">
            <Icon name="save" :size="16" />{{ t('Save config and restart') }}
          </button>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tabs {
  flex-wrap: wrap;
  align-self: flex-start;
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.empty {
  padding: 24px;
  color: var(--mu);
}
.items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.it {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  text-align: left;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--s2);
  color: var(--tx);
}
.it.on {
  border-color: var(--ac);
}
.params {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pr {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 40px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.pr.wide {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.pr i {
  font-style: normal;
  margin-left: 2px;
}
.cl {
  font-family: var(--fm);
  font-size: 11.5px;
  background: var(--s2);
  padding: 8px 10px;
  border-radius: 8px;
  word-break: break-all;
}
.warnrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.rec {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--bd);
}
.rec .grow {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rows {
  border-collapse: collapse;
  font-size: 12.5px;
}
.rows td {
  padding: 3px 12px 3px 0;
}
.log {
  margin: 0;
  font-family: var(--fm);
  font-size: 11px;
  color: var(--mu);
  white-space: pre-wrap;
  max-height: 220px;
  overflow: auto;
}
.mu {
  color: var(--mu);
}
.sm {
  font-size: 12px;
}
</style>
