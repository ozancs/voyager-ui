<script setup>
// Problem Solver page (under Calibrations in the menu): from what the print looks like to the likely causes and the next test. Pick or
// search the problem, optionally the print it happened on (History or a file), answer up to three questions, then
// see the causes with what each rests on (an answer, the file, the print's history record, the printer today) and
// what is missing, and one change to try. The result of a try is kept in Settings (solverLog). Nothing here moves,
// heats or changes the printer; the test buttons only open the calibration or page that does it.
import { ref, computed, onMounted, watch } from 'vue';
import Icon from './Icon.vue';
import { state, S, fmtTime, fmtDate } from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';
import { isGcodeFile } from '../gcode3mf';
import { pathSteps } from '../calibPath';
import { PROBLEMS, findProblems, nextQuestion, rankCauses } from '../solver/problems';
import { buildFacts } from '../solver/facts';
import { readFile } from '../solver/load';

const step = ref('pick'); // pick | print | ask | result
const q = ref('');
const found = computed(() => findProblems(q.value));
const problem = ref(null);
function pick(p) {
  problem.value = p;
  answers.value = {};
  step.value = 'print';
}

// ---- the print: from History or a file on the printer, or none
const jobs = ref([]);
const files = ref([]);
onMounted(async () => {
  try {
    const r = await api.call('server.history.list', { limit: 30, order: 'desc' });
    jobs.value = (r.jobs || []).sort((a, b) => b.start_time - a.start_time).slice(0, 8);
  } catch {}
  try {
    const r = await api.call('server.files.list', { root: 'gcodes' });
    files.value = r
      .filter((f) => isGcodeFile(f.path))
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 10);
  } catch {}
});
const choice = ref(null); // { job } | { path }
const loading = ref(false);
const read = ref(null); // { meta, cfg, modified }
watch(choice, async (c) => {
  read.value = null;
  if (!c) return;
  const path = c.job ? c.job.filename : c.path;
  if (c.job && c.job.exists === false) return (read.value = { meta: null, cfg: {}, modified: null });
  loading.value = true;
  try {
    const r = await readFile(path);
    if (choice.value === c) read.value = r;
  } finally {
    loading.value = false;
  }
});
const facts = computed(() =>
  buildFacts({
    meta: read.value?.meta || null,
    cfg: read.value?.cfg || {},
    job: choice.value?.job || null,
    fileModified: read.value?.modified ?? null,
    status: state.status,
  }),
);
const chosenName = computed(() => {
  const c = choice.value;
  return c ? (c.job ? c.job.filename : c.path).split('/').pop() : '';
});
const has = (v) => v != null && v !== '';
// the rows of each source, only what is known
const fileRows = computed(() => {
  const f = facts.value.file;
  return [
    ['Slicer', f.slicer],
    ['Filament', [f.filament, has(f.nozzle) && `${f.nozzle} mm nozzle`].filter(Boolean).join(' · ')],
    ['Nozzle / bed', has(f.nozzleTemp) || has(f.bedTemp) ? `${f.nozzleTemp ?? '--'}° / ${f.bedTemp ?? '--'}°` : null],
    ['Layer height', has(f.layer) && `${f.layer} mm`],
    ['Outer wall', has(f.outerSpeed) && `${f.outerSpeed} mm/s${has(f.outerAccel) ? ` · ${f.outerAccel} mm/s²` : ''}`],
    [
      'Retraction',
      f.fwRetract
        ? 'firmware (G10)'
        : has(f.retract) && `${f.retract} mm${has(f.retractSpeed) ? ` at ${f.retractSpeed} mm/s` : ''}`,
    ],
    ['Part fan', has(f.fanMax) && `${f.fanMin ?? '--'}–${f.fanMax}%`],
  ].filter(([, v]) => v);
});
const printRows = computed(() => {
  const p = facts.value.print;
  if (!p) return [];
  return [
    ['Status', p.status],
    ['Started', p.start && fmtDate(p.start)],
    ['Printed for', p.duration && fmtTime(p.duration)],
    ['Filament used', p.filamentUsed && `${(p.filamentUsed / 1000).toFixed(1)} m`],
    ['Spool', p.spoolIds?.length && `#${p.spoolIds.join(', #')}`],
  ].filter(([, v]) => v);
});
const todayRows = computed(() => {
  const d = facts.value.today;
  const sh = (s) => (s ? `${s.type} ${s.freq} Hz` : '--');
  return [
    ['Pressure advance', has(d.pa) && String(d.pa)],
    ['Input shaper', d.shaper ? `X ${sh(d.shaper.x)} · Y ${sh(d.shaper.y)}` : 'not set'],
    ['max_accel', has(d.maxAccel) && String(d.maxAccel)],
    ['Probe z_offset', has(d.probeOffset) && String(d.probeOffset)],
  ].filter(([, v]) => v);
});

// ---- questions
const answers = ref({});
const cur = computed(() => (problem.value ? nextQuestion(problem.value, answers.value) : null));
const asked = computed(() =>
  problem.value
    ? problem.value.questions
        .filter((x) => x.id in answers.value)
        .map((x) => x.opts.find((o) => o.v === answers.value[x.id])?.label)
    : [],
);
function startQuestions() {
  step.value = cur.value ? 'ask' : 'result';
}
function answer(o) {
  answers.value = { ...answers.value, [cur.value.id]: o.v };
  if (!nextQuestion(problem.value, answers.value)) step.value = 'result';
}
function back() {
  const ids = problem.value.questions.filter((x) => x.id in answers.value).map((x) => x.id);
  if (!ids.length) return (step.value = 'print');
  const a = { ...answers.value };
  delete a[ids[ids.length - 1]];
  answers.value = a;
}

// ---- result
const causes = computed(() => (problem.value ? rankCauses(problem.value, answers.value, facts.value) : []));
const top = computed(() => causes.value[0] || null);
const LEVEL = { 3: 'Likely', 2: 'Possible', 1: 'Less likely' };
const SRC = { answer: 'Your answer', file: 'In the file', print: 'This print', today: 'Printer today' };
// where a test can be opened on this printer
const calibSteps = computed(() =>
  pathSteps({
    commands: state.commands,
    settings: Object.fromEntries(
      [...Object.keys(S('configfile').settings || {}), ...(state.objects || [])].map((k) => [k.toLowerCase(), {}]),
    ),
    heaters: S('heaters').available_heaters || [],
  }),
);
const hasSensei = computed(() => (state.objects || []).some((o) => /^(pa_sensei|oznlab_sensor)( |$)/.test(o)));
function opener(test) {
  if (!test) return null;
  if (test.calib && calibSteps.value.some((s) => s.key === test.calib))
    return () => {
      state.calibOpen = test.calib;
      go('calibrations');
    };
  if (test.tab === 'shaketune' && state.commands && 'COMPARE_BELTS_RESPONSES' in state.commands)
    return () => go('calibrations', 'shaketune');
  if (test.pa && hasSensei.value) return () => go('oznlab');
  if (test.page) return () => go(test.page);
  return null;
}
const openTop = computed(() => opener(top.value?.test));

// ---- tries, kept in the settings
const RES = { fixed: 'Fixed', better: 'Better', same: 'No change' };
const res = ref('');
const note = ref('');
const tries = computed(() =>
  (state.settings.solverLog || []).filter((x) => x.problem === problem.value?.id).slice(0, 6),
);
function saveTry() {
  if (!res.value) return;
  const entry = {
    at: Date.now(),
    problem: problem.value.id,
    file: chosenName.value || '',
    change: note.value.trim() || t(top.value?.test.label || ''),
    result: res.value,
  };
  state.settings.solverLog = [entry, ...(state.settings.solverLog || [])].slice(0, 50);
  res.value = '';
  note.value = '';
}
function restart() {
  problem.value = null;
  answers.value = {};
  choice.value = null;
  q.value = '';
  step.value = 'pick';
}

const STEPS = [
  ['pick', 'Problem'],
  ['print', 'Print'],
  ['ask', 'Questions'],
  ['result', 'Causes'],
];
const idx = computed(() => STEPS.findIndex(([k]) => k === step.value));
const when = (ts) => fmtDate(ts / 1000);
</script>

<template>
  <section class="card ps">
    <div class="hd">
      <div class="col" style="gap: 4px; min-width: 0">
        <h2>{{ t('Problem Solver') }}</h2>
        <span class="mu">{{
          t('Start from what you see on the print. A few answers narrow it down to the next test.')
        }}</span>
      </div>
      <button v-if="step !== 'pick'" class="btn clear sm" @click="restart">
        <Icon name="refresh" :size="14" />{{ t('Start over') }}
      </button>
    </div>
    <ol class="crumbs">
      <li v-for="([k, l], i) in STEPS" :key="k" :class="{ on: i === idx, done: i < idx }">
        <button :disabled="i > idx" :aria-current="i === idx ? 'step' : null" @click="i < idx && (step = k)">
          <span class="n">{{ i + 1 }}</span
          >{{ t(l) }}
        </button>
      </li>
    </ol>

    <!-- 1: the problem -->
    <template v-if="step === 'pick'">
      <label class="search">
        <Icon name="search" :size="16" />
        <input
          v-model="q"
          class="input"
          :placeholder="t('Search a problem: ringing, stringing, warping…')"
          :aria-label="t('Search a problem')"
        />
      </label>
      <div class="grid">
        <button v-for="{ p, hit } in found" :key="p.id" class="pb" @click="pick(p)">
          <span class="ib"><Icon :name="p.icon" :size="18" /></span>
          <span class="col" style="gap: 2px; min-width: 0">
            <b>{{ t(p.name) }}</b>
            <span class="mu sm">{{ t(p.desc) }}</span>
            <span v-if="hit && hit !== p.name" class="hit sm">{{ t('matches “{w}”', { w: hit }) }}</span>
          </span>
        </button>
      </div>
      <p v-if="!found.length" class="mu">{{ t('Nothing matches. Try another word, in English or Turkish.') }}</p>
    </template>

    <!-- 2: the print it happened on (optional) -->
    <div v-else-if="step === 'print'" class="two">
      <div class="col" style="gap: 10px; min-width: 0">
        <h3>{{ t('Which print did it happen on?') }}</h3>
        <span class="mu sm">{{ t("The guide reads that print's file. You can also go on without one.") }}</span>
        <template v-if="jobs.length">
          <span class="lbl">{{ t('Print history') }}</span>
          <button
            v-for="j in jobs"
            :key="j.job_id"
            class="pr"
            :class="{ on: choice?.job === j }"
            :aria-pressed="choice?.job === j"
            @click="choice = { job: j }"
          >
            <Icon name="file" :size="16" class="mu" />
            <span class="col grow" style="gap: 1px; min-width: 0">
              <b class="mono fn">{{ j.filename.split('/').pop() }}</b>
              <span class="mu sm"
                >{{ fmtDate(j.start_time) }} · {{ fmtTime(j.print_duration) }} · {{ t(j.status) }}</span
              >
            </span>
          </button>
        </template>
        <template v-if="files.length">
          <span class="lbl">{{ t('Files on the printer') }}</span>
          <div class="files">
            <button
              v-for="f in files"
              :key="f.path"
              class="chipb mono"
              :class="{ on: choice?.path === f.path }"
              @click="choice = { path: f.path }"
            >
              {{ f.path.split('/').pop() }}
            </button>
          </div>
        </template>
        <div class="row" style="gap: 8px; margin-top: 4px; flex-wrap: wrap">
          <button class="btn acc" :disabled="!choice || loading" @click="startQuestions">
            {{ t('Continue with this print') }}
          </button>
          <button class="btn clear" @click="((choice = null), startQuestions())">
            {{ t('Continue without a file') }}
          </button>
        </div>
      </div>
      <div class="panel col" style="gap: 14px; min-width: 0">
        <h3>{{ choice ? t('What the guide found') : t('What the guide can use') }}</h3>
        <span v-if="loading" class="mu sm">{{ t('Reading the file…') }}</span>
        <template v-else-if="choice">
          <div class="grp">
            <span class="gh"
              ><Icon name="file" :size="14" />{{ t('In the file') }} <i>{{ t('as it is now') }}</i></span
            >
            <span v-if="facts.print?.fileGone || !facts.file.exists" class="mu sm">{{
              t('The file is no longer on the printer.')
            }}</span>
            <template v-else>
              <div v-for="[k, v] in fileRows" :key="k" class="kv">
                <span class="mu">{{ t(k) }}</span
                ><span class="mono">{{ v }}</span>
              </div>
              <span v-if="!facts.file.hasConfig" class="mu sm">{{
                t('No slicer settings block in this file (Cura and some slicers do not write one).')
              }}</span>
              <span v-if="facts.print?.fileChanged" class="warn sm">{{
                t('The file changed after this print, so it may not be what printed.')
              }}</span>
            </template>
          </div>
          <div v-if="facts.print" class="grp">
            <span class="gh"
              ><Icon name="clock" :size="14" />{{ t('This print') }} <i>{{ t('kept in the print history') }}</i></span
            >
            <div v-for="[k, v] in printRows" :key="k" class="kv">
              <span class="mu">{{ t(k) }}</span
              ><span class="mono">{{ v }}</span>
            </div>
          </div>
        </template>
        <div class="grp">
          <span class="gh"
            ><Icon name="printer3d" :size="14" />{{ t('Printer today') }}
            <i>{{ choice ? t('may differ from the print') : t('config and live values') }}</i></span
          >
          <div v-for="[k, v] in todayRows" :key="k" class="kv">
            <span class="mu">{{ t(k) }}</span
            ><span class="mono">{{ v }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3: questions, one at a time -->
    <div v-else-if="step === 'ask' && cur" class="ask">
      <div class="ctx">
        <span class="chip2"><Icon :name="problem.icon" :size="14" />{{ t(problem.name) }}</span>
        <span class="chip2 mono"><Icon name="file" :size="14" />{{ chosenName || t('No file') }}</span>
        <span v-for="(a, k) in asked" :key="k" class="chip2">{{ t(a) }}</span>
      </div>
      <div class="qcard">
        <span class="mu sm">{{ t('Question {n} of {m}', { n: asked.length + 1, m: problem.questions.length }) }}</span>
        <h3 class="qq">{{ t(cur.q) }}</h3>
        <span v-if="cur.hint" class="mu">{{ t(cur.hint) }}</span>
        <div class="opts">
          <button v-for="o in cur.opts" :key="o.v" class="opt" @click="answer(o)">
            <b>{{ t(o.label) }}</b
            ><span v-if="o.sub" class="mu sm">{{ t(o.sub) }}</span>
          </button>
        </div>
        <button class="btn clear sm" style="align-self: flex-start" @click="back">
          <Icon name="left" :size="14" />{{ t('Back') }}
        </button>
      </div>
    </div>

    <!-- 4: causes and the next test -->
    <div v-else class="two res">
      <div class="col" style="gap: 10px; min-width: 0">
        <div class="ctx">
          <span class="chip2"><Icon :name="problem.icon" :size="14" />{{ t(problem.name) }}</span>
          <span class="chip2 mono"><Icon name="file" :size="14" />{{ chosenName || t('No file') }}</span>
          <span v-for="(a, k) in asked" :key="k" class="chip2">{{ t(a) }}</span>
        </div>
        <h3>{{ t('Likely causes, most likely first') }}</h3>
        <article v-for="c in causes" :key="c.id" class="cause">
          <div class="row" style="gap: 8px; align-items: center">
            <span class="lv" :aria-label="t(LEVEL[c.level])"
              ><i v-for="k in 3" :key="k" :class="{ f: k <= c.level }"></i
            ></span>
            <span class="mu sm">{{ t(LEVEL[c.level]) }}</span>
          </div>
          <b class="ct">{{ t(c.title) }}</b>
          <span class="mu">{{ t(c.why) }}</span>
          <div v-if="c.evidence.length || c.missing.length" class="ev">
            <div v-for="(e, k) in c.evidence" :key="k" class="evr">
              <span class="src" :class="e[0]">{{ t(SRC[e[0]]) }}</span
              ><span>{{ t(e[1]) }}</span>
            </div>
            <div v-for="(m, k) in c.missing" :key="'m' + k" class="evr miss">
              <span class="src">{{ t('Not known') }}</span
              ><span>{{ t(m) }}</span>
            </div>
          </div>
        </article>
        <p v-if="!causes.length" class="mu">{{ t('Nothing in the answers or the file points to a cause.') }}</p>
      </div>
      <div v-if="top" class="col" style="gap: 12px; min-width: 0">
        <div class="panel col next" style="gap: 10px">
          <span class="lbl">{{ t('Next test') }}</span>
          <h3>{{ t(top.test.label) }}</h3>
          <span class="mu">{{ t(top.test.how) }}</span>
          <button v-if="openTop" class="btn acc" style="align-self: flex-start" @click="openTop()">
            <Icon name="play" :size="15" />{{ t('Open') }}
          </button>
          <div class="one">
            <b>{{ t('One change at a time') }}</b>
            <span class="mu sm">{{ t(top.test.change) }} {{ t('Then print the same file again and compare.') }}</span>
          </div>
        </div>
        <div class="panel col" style="gap: 10px">
          <span class="lbl">{{ t('How did it go?') }}</span>
          <div class="seg">
            <button v-for="(l, k) in RES" :key="k" :class="{ on: res === k }" @click="res = k">{{ t(l) }}</button>
          </div>
          <input
            v-model="note"
            class="input"
            :placeholder="t('What you changed')"
            :aria-label="t('What you changed')"
          />
          <button class="btn" style="align-self: flex-start" :disabled="!res" @click="saveTry">
            {{ t('Save the result') }}
          </button>
          <div v-for="(tr, k) in tries" :key="k" class="try">
            <span class="mono mu sm">{{ when(tr.at) }}</span
            ><span class="grow">{{ tr.change }}</span
            ><span class="rs" :class="tr.result">{{ t(RES[tr.result]) }}</span>
          </div>
          <span v-if="tries.some((x) => x.result !== 'fixed')" class="mu sm">{{
            t('Not fixed yet: try the next cause on the left, one change at a time.')
          }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ps {
  gap: 16px;
}
.hd {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}
h2 {
  margin: 0;
  font-size: 18px;
}
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.sm {
  font-size: 12.5px;
}
.btn.sm {
  height: 30px;
  padding: 0 10px;
  font-size: 12.5px;
}
.warn {
  color: var(--wn);
}
.crumbs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.crumbs button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px 0 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--mu);
  font-size: 13px;
}
.crumbs .n {
  width: 20px;
  height: 20px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--s2);
}
.crumbs li.on button {
  color: var(--tx);
  background: var(--s2);
}
.crumbs li.on .n {
  background: var(--ac);
  color: var(--oa, #111);
}
.crumbs li.done button {
  color: var(--tx);
  cursor: pointer;
}
.search {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  padding-left: 12px;
  border-radius: 10px;
  background: var(--s2);
  color: var(--mu);
}
.search .input {
  flex: 1;
  background: transparent;
  border: 0;
  height: 44px;
  padding-left: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 8px;
}
.pb {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  text-align: left;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--s2);
  color: var(--tx);
}
.pb:hover {
  background: var(--s3);
}
.ib {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--s3);
  color: var(--mu);
}
.hit {
  color: var(--ac);
}
.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}
.lbl {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mu);
}
.pr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--s2);
  color: var(--tx);
}
.pr.on {
  border-color: var(--ac);
}
.fn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chipb {
  height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--s2);
  color: var(--tx);
  font-size: 12.5px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chipb.on {
  border-color: var(--ac);
}
.panel {
  padding: 16px;
  border-radius: 10px;
  background: var(--s2);
}
.panel .btn,
.panel .input,
.panel .seg {
  background: var(--s3);
}
.panel .btn.acc {
  background: color-mix(in srgb, var(--ac) 22%, var(--s3));
  color: color-mix(in srgb, var(--ac) 50%, var(--tx));
}
.panel .seg button.on {
  background: var(--s1);
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gh {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.gh i {
  font-style: normal;
  font-weight: 400;
  color: var(--mu);
  font-size: 12.5px;
}
.grp > .sm {
  padding-left: 20px;
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding-left: 20px;
}
.kv .mono {
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ask {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 640px;
}
.ctx {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip2 {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--s2);
  font-size: 12.5px;
}
.qcard {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  border-radius: 12px;
  background: var(--s2);
}
.qq {
  font-size: 19px;
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.opt {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--s3);
  color: var(--tx);
  font-size: 14px;
}
.opt:hover {
  border-color: var(--ac);
}
.cause {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--s2);
}
.ct {
  font-size: 15px;
}
.lv {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}
.lv i {
  width: 4px;
  border-radius: 1px;
  background: var(--s3);
}
.lv i:nth-child(1) {
  height: 5px;
}
.lv i:nth-child(2) {
  height: 8px;
}
.lv i:nth-child(3) {
  height: 12px;
}
.lv i.f {
  background: var(--tx);
}
.ev {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}
.evr {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 13px;
}
.src {
  flex: none;
  width: 92px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mu);
}
.src.answer {
  color: var(--tx);
}
.evr.miss {
  color: var(--mu);
}
.evr.miss .src {
  color: var(--wn);
}
.next h3 {
  font-size: 17px;
}
.one {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px dashed var(--bd);
}
.seg {
  align-self: flex-start;
}
.try {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 13px;
  padding-top: 8px;
  border-top: 1px solid var(--bd);
}
.rs {
  font-weight: 600;
}
.rs.fixed {
  color: var(--ok);
}
.rs.same {
  color: var(--mu);
}
@media (max-width: 860px) {
  .two {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
