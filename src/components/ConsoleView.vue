<script setup>
// Console output and the G-code input. Shows state.console (filled by the store from Moonraker's
// gcode responses), keeps scrolled to the bottom unless the user scrolls up, remembers sent commands (arrow
// up/down) and colours errors. Macro markup (Happy Hare) is rendered through richText.js, never as raw HTML.
// Options (Settings > Console): a sent command and the replies after it drawn as one block with its own copy
// button, text colour themes, the command help on hover, timestamps and line wrap.
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import Icon from './Icon.vue';
import CmdInput from './CmdInput.vue';
import { state, gcode, restartKlipper, toast } from '../store';
import { t } from '../i18n';
import { richHtml, hasMarkup } from '../richText';
import Popover from './Popover.vue';
import ExplainBox from './ExplainBox.vue';
import { explain } from '../explain';
import { describe } from '../gcodeHelp';
// search: only lines with this text (marked); errors: only error lines, each with the command sent before it
const props = defineProps({
  limit: { type: Number, default: 400 },
  search: { type: String, default: '' },
  errors: Boolean,
});
const box = ref(null);
const cmd = ref('');
const hist = [];
let hi = -1;
const auto = ref(true);
const TEMP_RE = /^(ok\s+)?(B|T\d*|C):\s*-?\d/;
const lines = computed(() => {
  let l = state.console;
  l = l.filter(
    (x) =>
      !(x.type === 'command' && /NAME=_ui_|MSG=action:prompt_end/.test(x.message)) &&
      !x.message.startsWith('// action:'),
  );
  if (state.settings.consoleHideTemps) l = l.filter((x) => !TEMP_RE.test(x.message));
  if (props.errors) {
    const keep = new Set();
    l.forEach((x, i) => {
      if (!isErr(x)) return;
      keep.add(x);
      for (let k = i - 1; k >= 0 && k >= i - 6; k--)
        if (l[k].type === 'command') {
          keep.add(l[k]);
          break;
        }
    });
    l = l.filter((x) => keep.has(x));
  }
  const q = props.search.trim().toLowerCase();
  if (q) l = l.filter((x) => x.message.toLowerCase().includes(q));
  return l.slice(-props.limit);
});
const isErr = (x) => x.type !== 'command' && (/^!!/.test(x.message) || /\b(error|failed|shutdown)\b/i.test(x.message));
// the line cut where the search text is, so the hits can be marked
function parts(msg) {
  const q = props.search.trim().toLowerCase();
  if (!q) return [{ s: msg }];
  const out = [],
    low = msg.toLowerCase();
  let i = 0,
    j;
  while ((j = low.indexOf(q, i)) >= 0) {
    if (j > i) out.push({ s: msg.slice(i, j) });
    out.push({ s: msg.slice(j, j + q.length), hit: true });
    i = j + q.length;
  }
  if (i < msg.length) out.push({ s: msg.slice(i) });
  return out;
}
const filtering = computed(() => props.errors || !!props.search.trim());
// blocks to draw: with grouping on, a sent command and the lines that follow it, as long as they keep coming
// (each within GAP seconds of the one before: what comes after a pause is something else, a periodic message or
// another macro). A command nothing answered and lines outside a group stay single lines.
const GAP = 10;
const blocks = computed(() => {
  const out = [];
  let g = null;
  for (const l of lines.value) {
    if (!state.settings.consoleGroup) {
      out.push({ key: l.id, lines: [l] });
      continue;
    }
    if (l.type === 'command') {
      g = { key: l.id, lines: [l], last: l.time };
      out.push(g);
    } else if (g && l.time - g.last <= GAP) {
      g.lines.push(l);
      g.last = l.time;
    } else {
      g = null;
      out.push({ key: l.id, lines: [l] });
    }
  }
  for (const b of out) b.grp = b.lines.length > 1 && b.lines[0].type === 'command';
  return out;
});
// plain text of some lines, as shown (time, "> " before a sent command)
const plain = (ls) =>
  ls
    .map((l) => (state.settings.consoleTime ? fmt(l.time) + '  ' : '') + (l.type === 'command' ? '> ' : '') + l.message)
    .join('\n');
const copied = ref(null); // the block (or 'all') just copied, for the tick
async function copy(ls, which) {
  const txt = plain(ls);
  try {
    await navigator.clipboard.writeText(txt);
    copied.value = which;
    setTimeout(() => copied.value === which && (copied.value = null), 1400);
  } catch {
    toast(t('Copying is blocked here. Select the text and copy it instead.'), 'error');
  }
}
const copyAll = () => copy(lines.value, 'all');
const THEMES = ['default', 'soft', 'terminal', 'contrast', 'paper'];
const theme = computed(() => (THEMES.includes(state.settings.consoleTheme) ? state.settings.consoleTheme : 'default'));
const fmt = (t) => new Date(t * 1000).toLocaleTimeString(undefined, { hour12: false });
function scroll() {
  if (auto.value && box.value) box.value.scrollTop = box.value.scrollHeight;
}
// lines that arrived while scrolled up, shown on the jump button
const unseen = ref(0);
// watch the last id, not the length: the list is capped, so the length stops changing once it is full
watch(
  () => lines.value[lines.value.length - 1]?.id,
  (n, o) => {
    if (!auto.value && n != null && o != null) unseen.value += Math.max(1, Math.min(n - o, lines.value.length));
    nextTick(scroll);
  },
);
function toBottom() {
  const b = box.value;
  if (!b) return;
  auto.value = true;
  unseen.value = 0;
  b.scrollTo({
    top: b.scrollHeight,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}
onMounted(() => nextTick(scroll));
// command picked in Ctrl+K search lands here
const ci = ref(null);
function takeDraft() {
  if (state.consoleDraft) {
    cmd.value = state.consoleDraft;
    state.consoleDraft = '';
    nextTick(() => ci.value?.focus());
  }
}
onMounted(takeDraft);
watch(() => state.consoleDraft, takeDraft);
function onScroll() {
  const b = box.value;
  if (!b) return;
  auto.value = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
  if (auto.value) unseen.value = 0;
}
async function send() {
  const c = cmd.value.trim();
  if (!c) return;
  hist.push(c);
  hi = hist.length;
  cmd.value = '';
  auto.value = true;
  // typed RESTART / FIRMWARE_RESTART: through Moonraker, so a busy G-code queue cannot hold them back
  const up = c.toUpperCase();
  if (up === 'FIRMWARE_RESTART' || up === 'RESTART') return restartKlipper(up === 'FIRMWARE_RESTART');
  gcode(c, { quiet: true }).catch(() => {});
}
function key(e) {
  if (e.key === 'ArrowUp') {
    if (hi > 0) {
      hi--;
      cmd.value = hist[hi];
    }
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    if (hi < hist.length - 1) {
      hi++;
      cmd.value = hist[hi];
    } else {
      hi = hist.length;
      cmd.value = '';
    }
    e.preventDefault();
  }
}
const cls = (l) =>
  l.type === 'command'
    ? 'c'
    : /^!!/.test(l.message)
      ? 'e'
      : l.message.startsWith('//')
        ? 'i'
        : l.type === 'hint'
          ? 'h'
          : '';
defineExpose({ setCmd: (c) => (cmd.value = c), copyAll, copied });
// ? next to an error line: what the error means (explain.js)
const xOpen = ref(null); // { anchor, e }
const openX = (ev, msg) => (xOpen.value = { anchor: ev.currentTarget, e: explain(msg) });
</script>
<template>
  <div class="cv">
    <div class="wrap">
      <div
        ref="box"
        class="out"
        :class="['th-' + theme, { nowrap: !state.settings.consoleWrap, notime: !state.settings.consoleTime }]"
        @scroll="onScroll"
      >
        <div v-for="b in blocks" :key="b.key" :class="{ grp: b.grp }">
          <button
            v-if="b.grp"
            class="gcp"
            :aria-label="t('Copy')"
            :data-tip="copied === b.key ? t('Copied') : t('Copy')"
            @click="copy(b.lines, b.key)"
          >
            <Icon :name="copied === b.key ? 'check' : 'copy'" :size="13" />
          </button>
          <div v-for="l in b.lines" :key="l.id" class="ln" :class="cls(l)">
            <span v-if="state.settings.consoleTime" class="t">{{ fmt(l.time) }}</span
            ><span v-if="l.type !== 'command' && hasMarkup(l.message)" class="m" v-html="richHtml(l.message)"></span
            ><span
              v-else
              class="m"
              :class="{ hp: l.type === 'command' && state.settings.consoleHelp }"
              :data-tip="l.type === 'command' && state.settings.consoleHelp ? describe(l.message) || null : null"
              >{{ l.type === 'command' ? '> ' : ''
              }}<template v-for="(p, i) in parts(l.message)" :key="i"
                ><mark v-if="p.hit">{{ p.s }}</mark
                ><template v-else>{{ p.s }}</template></template
              ></span
            ><button
              v-if="cls(l) === 'e' && explain(l.message)"
              class="xq"
              :aria-label="t('What does this mean?')"
              :data-tip="t('What does this mean?')"
              @click="openX($event, l.message)"
            >
              ?
            </button>
          </div>
        </div>
        <div v-if="filtering && !lines.length" class="none">
          {{ errors ? t('No errors in the console') : t('Nothing matches') }}
        </div>
      </div>
      <Transition name="jb">
        <button v-if="!auto" class="jump" :aria-label="t('Scroll to bottom')" @click="toBottom">
          <span v-if="unseen" class="nw">{{ unseen > 99 ? '99+' : unseen }}</span
          ><Icon name="down" :size="18" :stroke="2.6" />
        </button>
      </Transition>
    </div>
    <div class="row">
      <label class="in"
        ><span class="p">&gt;</span
        ><CmdInput
          ref="ci"
          v-model="cmd"
          drop-up
          :placeholder="t('Send G-code… (type to search commands, ↑↓ history)')"
          :aria-label="t('G-code command')"
          input-class="cin"
          @keydown="key"
          @enter="send"
      /></label>
      <button class="btn acc ibtn" :aria-label="t('Send')" @click="send"><Icon name="send" :stroke="2.4" /></button>
    </div>
    <Popover v-if="xOpen" :anchor="xOpen.anchor" :width="340" @close="xOpen = null">
      <ExplainBox :e="xOpen.e" />
    </Popover>
  </div>
</template>
<style scoped>
mark {
  background: color-mix(in srgb, var(--ac) 35%, transparent);
  color: inherit;
  border-radius: 2px;
}
.none {
  color: var(--mu);
  padding: 8px 2px;
}
.m.hp[data-tip] {
  cursor: help;
}
.xq {
  margin-left: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--bd);
  background: var(--s2);
  color: var(--mu);
  font: 600 11px/1 var(--fb, inherit);
  cursor: pointer;
  vertical-align: 1px;
}
.xq:hover {
  color: var(--tx);
}
.cv {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.wrap {
  position: relative;
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
}
.jump {
  position: absolute;
  right: 18px;
  bottom: 14px;
  height: 40px;
  min-width: 40px;
  padding: 0 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 20px;
  background: var(--ac);
  color: var(--oa);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  font-weight: 600;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.jump:hover {
  filter: brightness(1.08);
}
.jb-enter-active,
.jb-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}
.jb-enter-from,
.jb-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
.out {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  padding: 10px 14px;
  background: var(--k-bg);
  border: none;
  border-radius: 10px;
  font-family: var(--fm);
  font-size: 13px;
  line-height: 1.7;
  /* text themes (Settings > Console): only the log's own colours change */
  --k-bg: #121418;
  --k-time: var(--mu2);
  --k-text: var(--mu);
  --k-cmd: var(--tx);
  --k-err: var(--dg);
  --k-info: var(--tx);
  --k-hint: var(--bl);
}
/* softer: lower contrast, easy on the eyes for a console left open all day */
.out.th-soft {
  --k-bg: #16181c;
  --k-time: #565c66;
  --k-text: #979da6;
  --k-cmd: #d3d6db;
  --k-err: #e08a83;
  --k-info: #bfc4ca;
  --k-hint: #85a9d6;
}
/* the classic terminal: green on black */
.out.th-terminal {
  --k-bg: #070b07;
  --k-time: #2e6a3a;
  --k-text: #3ccf5a;
  --k-cmd: #b9f5c4;
  --k-err: #ff6b62;
  --k-info: #8fe3a0;
  --k-hint: #6ec4ff;
}
/* high contrast: white on black, bright error and info colours */
.out.th-contrast {
  --k-bg: #000;
  --k-time: #a3a3a3;
  --k-text: #f2f2f2;
  --k-cmd: #fff;
  --k-err: #ff5050;
  --k-info: #ffd866;
  --k-hint: #66d9ff;
}
/* paper: dark ink on a light page, readable in a bright room */
.out.th-paper {
  --k-bg: #ebe7dc;
  --k-time: #8b8679;
  --k-text: #3b3934;
  --k-cmd: #111;
  --k-err: #b0281f;
  --k-info: #1e1c19;
  --k-hint: #2a5ca6;
}
.ln {
  display: flex;
  gap: 14px;
  color: var(--k-text);
}
.ln .t {
  color: var(--k-time);
  flex-shrink: 0;
}
.ln .m {
  white-space: pre-wrap;
  word-break: break-word;
}
.nowrap .ln .m {
  white-space: pre;
  word-break: normal;
}
.nowrap > div {
  width: max-content;
  min-width: 100%;
}
.ln.c {
  color: var(--k-cmd);
  font-weight: 600;
}
.ln.e {
  color: var(--k-err);
}
.ln.i {
  color: var(--k-info);
}
.ln.h {
  color: var(--k-hint);
}
/* a sent command with its replies: one block, its copy button on hover */
.grp {
  position: relative;
  margin: 3px -8px;
  padding: 2px 8px 2px 6px; /* the 2 px rule keeps the text in line with the lines around */
  border-left: 2px solid color-mix(in srgb, var(--k-cmd) 28%, transparent);
  border-radius: 0 6px 6px 0;
  background: color-mix(in srgb, var(--k-text) 6%, transparent);
}
.gcp {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  display: none;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--k-text) 25%, transparent);
  border-radius: 6px;
  background: var(--k-bg);
  color: var(--k-text);
  cursor: pointer;
}
.grp:hover .gcp,
.gcp:focus-visible {
  display: flex;
}
.gcp:hover {
  color: var(--k-cmd);
}
.in {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px;
  background: var(--s2);
  border: 1px solid transparent;
  border-radius: 10px;
}
.in:focus-within {
  border-color: var(--ac);
}
.in :deep(.cin) {
  flex: 1;
  height: 40px;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--fm);
  font-size: 13px;
}
.p {
  font-family: var(--fm);
  color: var(--ac);
  font-weight: 600;
}
</style>
