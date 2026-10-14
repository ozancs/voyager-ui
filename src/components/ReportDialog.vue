<script setup>
// Report a problem: opens a new GitHub issue with the details a bug report usually lacks (versions, Klipper state,
// browser, the page, the last console lines) already filled in. Nothing is sent from here; GitHub opens in a new
// tab with the text in the editor, so it can be read and changed before it is posted.
import { ref, computed } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { state, VERSION, REPO_URL } from '../store';
import { route } from '../router';
import { t } from '../i18n';
const emit = defineEmits(['close']);
const what = ref('');
const withConsole = ref(true);
const N = 15; // console lines; GitHub refuses very long links
// IP addresses in the console lines are masked, the rest of the network stays out of the report
const mask = (s) => String(s).replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, 'x.x.x.x');
const env = computed(() => {
  const v = state.versions;
  const ua = navigator.userAgent;
  const browser =
    (/Edg\/([\d.]+)/.exec(ua) && 'Edge ' + /Edg\/([\d]+)/.exec(ua)[1]) ||
    (/Chrome\/([\d]+)/.exec(ua) && 'Chrome ' + /Chrome\/([\d]+)/.exec(ua)[1]) ||
    (/Firefox\/([\d]+)/.exec(ua) && 'Firefox ' + /Firefox\/([\d]+)/.exec(ua)[1]) ||
    (/Version\/([\d.]+).*Safari/.exec(ua) && 'Safari ' + /Version\/([\d.]+)/.exec(ua)[1]) ||
    'other';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'other';
  return [
    `Voyager UI ${VERSION}`,
    `Klipper ${v.klipper || '?'}, Moonraker ${v.moonraker || '?'}`,
    `Klipper state: ${state.klippy}${state.klippy !== 'ready' && state.klippyMessage ? ' (' + mask(state.klippyMessage).split('\n')[0].slice(0, 160) + ')' : ''}`,
    `Browser: ${browser} on ${os}, window ${innerWidth}x${innerHeight}, interface size ${state.settings.uiScale ?? 100}`,
    `Page: ${route.name}${route.arg ? '/' + route.arg : ''}`,
  ];
});
const lines = computed(() => state.console.slice(-N).map((l) => mask(l.message).replace(/\s+/g, ' ').slice(0, 160)));
const body = computed(() => {
  const parts = [
    '**What happened**',
    what.value.trim() || '',
    '',
    '**What should have happened**',
    '',
    '',
    '**Steps to get there**',
    '',
    '',
    '---',
    ...env.value.map((l) => '- ' + l),
  ];
  if (withConsole.value && lines.value.length)
    parts.push('', '<details><summary>Last console lines</summary>', '', '```', ...lines.value, '```', '</details>');
  return parts.join('\n');
});
const url = computed(
  () =>
    `${REPO_URL}/issues/new?title=${encodeURIComponent(what.value.trim().split('\n')[0].slice(0, 80))}&body=${encodeURIComponent(body.value)}`,
);
</script>
<template>
  <Modal :title="t('Report a problem')" width="560px" @close="emit('close')">
    <p class="mu" style="margin: 0">
      {{
        t(
          'Opens a new issue on GitHub with the details below filled in. You can read and change everything there before posting; a GitHub account is needed.',
        )
      }}
    </p>
    <label class="col" style="gap: 6px">
      <span class="lbl">{{ t('What happened?') }}</span>
      <textarea
        v-model="what"
        class="input ta"
        rows="3"
        :placeholder="t('For example: the webcam stays black after switching printers')"
      ></textarea>
    </label>
    <div class="env mono">
      <div v-for="l in env" :key="l">{{ l }}</div>
    </div>
    <label class="row ck"
      ><input v-model="withConsole" type="checkbox" class="cb" /><span>{{
        t('Add the last {n} console lines (IP addresses hidden)', { n: N })
      }}</span></label
    >
    <template #foot>
      <button class="btn lg" @click="emit('close')">{{ t('Cancel') }}</button>
      <a class="btn lg acc" :href="url" target="_blank" rel="noopener" @click="emit('close')"
        ><Icon name="ext" :size="16" />{{ t('Open on GitHub') }}</a
      >
    </template>
  </Modal>
</template>
<style scoped>
.mu {
  color: var(--mu);
  font-size: 13px;
}
.lbl {
  font-size: 13px;
  font-weight: 600;
}
.ta {
  height: auto;
  min-height: 72px;
  padding: 10px 12px;
  resize: vertical;
  font: inherit;
  line-height: 1.45;
}
.env {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--mu);
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--bd);
  border-radius: 8px;
  overflow-wrap: anywhere;
}
.ck {
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
}
a.btn {
  text-decoration: none;
}
</style>
