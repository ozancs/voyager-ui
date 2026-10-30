<script setup>
// Start dialog (preprint.js), shown before every print like Mainsail's: the thumbnail and the file's numbers, the
// timelapse switch when moonraker-timelapse is installed (the same setting as the Timelapse card, saved at once),
// a reminder to clear the bed for a reprint, and what the pre-print check found that does not fit. "Don't check
// again" turns the check off (Settings > General turns it back on).
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import { computed, onMounted } from 'vue';
import { state, saveSettings, fmtTime } from '../store';
import { cfgIndex, loadConfigIndex } from '../features';
import { tl, saveSettings as saveTl } from '../timelapse';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';
// where a config value the check compared against lives: file and line, from the config index
onMounted(() => loadConfigIndex());
const where = (c) =>
  c &&
  cfgIndex.items.find(
    (x) => x.kind === 'option' && x.section.toLowerCase() === c.section && x.key.toLowerCase() === c.key,
  );
function openCfg(c) {
  const w = where(c);
  answer(false); // the print does not start; the file opens at the line
  state.jump = { file: w.file, line: w.line, t: Date.now() };
  go('config', w.file);
}
const answer = (v) => state.preprint?.resolve(v);
function never() {
  state.settings.preprintCheck = false;
  saveSettings();
  answer(true);
}

const q = computed(() => state.preprint);
const name = computed(() => q.value?.filename.split('/').pop() || '');
const thumb = computed(() => {
  const m = q.value?.meta;
  if (!m?.thumbnails?.length) return null;
  const th = [...m.thumbnails].sort((a, b) => b.width - a.width)[0];
  const dir = q.value.filename.split('/').slice(0, -1).join('/');
  return api.fileUrl('gcodes', (dir ? dir + '/' : '') + th.relative_path);
});
// the numbers the slicer wrote, only those it did
const facts = computed(() => {
  const m = q.value?.meta || {};
  const out = [];
  if (m.estimated_time) out.push([t('Time'), fmtTime(m.estimated_time)]);
  if (m.filament_weight_total) out.push([t('Filament'), Math.round(m.filament_weight_total) + ' g']);
  else if (m.filament_total) out.push([t('Filament'), (m.filament_total / 1000).toFixed(1) + ' m']);
  if (m.layer_height) out.push([t('Layer height'), m.layer_height + ' mm']);
  if (m.filament_type) out.push([t('Material'), m.filament_type]);
  return out;
});
</script>
<template>
  <Modal v-if="q" :title="t('Start print')" width="560px" :z="190" @close="answer(false)">
    <div class="hd">
      <div class="th">
        <img v-if="thumb" :src="thumb" alt="" />
        <Icon v-else name="cube" :size="34" class="mu" />
      </div>
      <div class="col" style="gap: 8px; min-width: 0">
        <b class="nm">{{ name }}</b>
        <dl v-if="facts.length" class="facts">
          <template v-for="[k, v] in facts" :key="k"
            ><dt>{{ k }}</dt>
            <dd class="mono">{{ v }}</dd></template
          >
        </dl>
      </div>
    </div>
    <p v-if="q.reprint" class="note">
      <Icon name="warn" :size="16" style="color: var(--wn)" />{{ t('Take the last print off the bed first.') }}
    </p>
    <template v-if="q.issues.length">
      <div v-for="(i, k) in q.issues" :key="k" class="it">
        <Icon
          :name="i.level === 'error' ? 'excl' : 'warn'"
          :size="18"
          :style="{ color: i.level === 'error' ? 'var(--dg)' : 'var(--wn)' }"
        />
        <span class="col" style="gap: 3px"
          >{{ t(i.text, i.params) }}
          <button v-if="where(i.cfg)" class="lnk sm" @click="openCfg(i.cfg)">
            {{ where(i.cfg).file }}, {{ t('line {n}', { n: where(i.cfg).line }) }}: [{{ where(i.cfg).section }}]
            {{ i.cfg.key }}
          </button>
          <span v-else-if="i.cfg" class="mono sm mu">[{{ i.cfg.section }}] {{ i.cfg.key }}</span>
        </span>
      </div>
      <button class="lnk sm mu" @click="never">{{ t('Print and stop checking files before printing') }}</button>
    </template>
    <div v-if="tl.has" class="tlr">
      <Icon name="video" :size="17" class="mu" />
      <span class="grow">{{ t('Timelapse') }}</span>
      <Toggle
        :model-value="!!tl.settings?.enabled"
        :label="t('Record timelapse')"
        :disabled="tl.saving"
        @update:model-value="saveTl({ enabled: $event })"
      />
    </div>
    <template #foot>
      <button class="btn lg" @click="answer(false)">{{ t('Cancel') }}</button>
      <button class="btn lg acc" @click="answer(true)">
        <Icon name="play" :size="16" :stroke="2.4" />{{ q.issues.length ? t('Print anyway') : t('Print') }}
      </button>
    </template>
  </Modal>
</template>
<style scoped>
.hd {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.th {
  flex: none;
  width: 120px;
  height: 120px;
  border-radius: var(--r);
  background: var(--s2);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.th img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.nm {
  font-size: 15px;
  word-break: break-word;
}
.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;
}
.facts dt {
  color: var(--mu);
}
.facts dd {
  margin: 0;
}
.note {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  font-size: 13.5px;
}
.tlr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--r);
  background: var(--s2);
  font-size: 13.5px;
}
.it {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13.5px;
  line-height: 1.45;
}
.it :deep(svg) {
  flex-shrink: 0;
  margin-top: 1px;
}
.lnk {
  align-self: flex-start;
  background: none;
  border: 0;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
}
.sm {
  font-size: 12px;
}
.mu {
  color: var(--mu);
}
@media (max-width: 480px) {
  .th {
    width: 84px;
    height: 84px;
  }
}
</style>
