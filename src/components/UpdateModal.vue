<script setup>
// Log of a running update (Moonraker's update manager). Shows the output lines as they come in
// and a close button when the update is done.
import { ref, watch, nextTick, computed, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { state } from '../store';
import { t } from '../i18n';
import { copyText } from '../clipboard';
const box = ref(null);
const u = computed(() => state.update);
watch(
  () => state.update?.lines.length,
  () =>
    nextTick(() => {
      if (box.value) box.value.scrollTop = box.value.scrollHeight;
    }),
);
// Moonraker runs one update task at a time: while it is still checking for updates (its own timer, our 6-hourly
// check or the Check button) a new update waits for that to finish and sends nothing. Say so after a few seconds.
const waited = ref(0);
let tick = null;
watch(
  () => !!state.update && !state.update.lines.length,
  (w) => {
    clearInterval(tick);
    waited.value = 0;
    if (w) tick = setInterval(() => waited.value++, 1000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(tick));
// Moonraker names a full update 'full'; a page opened during one learns about it from these messages
const title = computed(() =>
  ['all', 'full'].includes(u.value?.app) ? t('Updating everything') : t('Updating {name}', { name: u.value?.app }),
);
const failed = computed(() => u.value?.lines.some((l) => /^!!|error|failed/i.test(l)));
// PackageKit gives up when an upgrade needs other packages removed (a new libcamera taking the old camera streamer
// and old kernels with it) and Moonraker only says "Exit Failed". Nothing is removed from here: the user runs apt
// over SSH and checks what it wants to remove.
const SYS_FAIL = /Error updating system packages|Transaction Update packages: Exit Failed/i;
const sysFail = computed(() => !!u.value?.complete && u.value.lines.some((l) => SYS_FAIL.test(l)));
const CMDS = 'sudo apt update\nsudo apt full-upgrade';
const copied = ref(false);
async function copy() {
  try {
    await copyText(CMDS);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {}
}
</script>
<template>
  <div v-if="u" class="ov">
    <div class="card md" role="dialog" :aria-label="t('Update progress')">
      <div class="card-h">
        <h2 class="row">
          <Icon v-if="!u.complete" name="refresh" :size="18" class="spin" style="color: var(--ac)" /><Icon
            v-else
            :name="failed ? 'warn' : 'check'"
            :size="18"
            :style="{ color: failed ? 'var(--dg)' : 'var(--ok)' }"
          />{{ title }}
        </h2>
        <span class="chip" :style="{ color: u.complete ? (failed ? 'var(--dg)' : 'var(--ok)') : 'var(--ac)' }"
          ><i></i>{{ u.complete ? (failed ? t('Finished with errors') : t('Complete')) : t('Running') }}</span
        >
      </div>
      <div v-if="sysFail" class="sf">
        <h3 class="row">
          <Icon name="warn" :size="17" style="color: var(--wn)" />{{ t('System update could not finish') }}
        </h3>
        <p>
          {{
            t(
              'Some packages can only be updated if other packages are removed. This is not done automatically: connect over SSH, run the commands below, check the packages it wants to remove and confirm.',
            )
          }}
        </p>
        <div class="cmd">
          <pre class="mono">{{ CMDS }}</pre>
          <button class="btn sm" @click="copy">
            <Icon :name="copied ? 'check' : 'copy'" :size="14" />{{ copied ? t('Copied') : t('Copy') }}
          </button>
        </div>
        <p class="mu">{{ t('Make sure the running kernel is not in the list to remove, check it with uname -r.') }}</p>
        <p class="mu">
          {{
            t(
              'Tip: with enable_packagekit: False in the [update_manager] section of moonraker.conf, Moonraker updates with apt-get upgrade. Packages that need a removal are then skipped and the rest is updated without this error.',
            )
          }}
        </p>
      </div>
      <details v-if="sysFail" class="det">
        <summary>{{ t('Details') }}</summary>
        <div class="log mono sm">
          <div v-for="(l, i) in u.lines" :key="i" :class="{ e: /^!!|error|failed/i.test(l) }">{{ l }}</div>
        </div>
      </details>
      <div v-else ref="box" class="log mono">
        <div v-if="!u.lines.length" class="mu">
          {{ t('Waiting for Moonraker…') }}
          <template v-if="waited >= 4"
            ><br />{{
              t(
                'Moonraker is still busy with another task, usually checking for updates. The update starts as soon as that finishes.',
              )
            }}</template
          >
        </div>
        <div v-for="(l, i) in u.lines" :key="i" :class="{ e: /^!!|error|failed/i.test(l) }">{{ l }}</div>
      </div>
      <div v-if="!u.complete" class="bar"><div class="ind"></div></div>
      <div class="row" style="justify-content: flex-end">
        <span v-if="!state.connected" class="mu" style="font-size: 12px; margin-right: auto">{{
          t('Moonraker is restarting, reconnecting…')
        }}</span>
        <button
          class="btn lg"
          :class="{ acc: u.complete }"
          :disabled="!u.complete && state.connected"
          @click="state.update = null"
        >
          {{ t('Close') }}
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.ov {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
  padding: 16px;
}
.md {
  width: 760px;
  max-width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.log {
  height: 380px;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--bd);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--mu);
  white-space: pre-wrap;
  word-break: break-word;
}
.log.sm {
  height: 200px;
  margin-top: 8px;
}
.sf {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sf h3 {
  margin: 0;
  gap: 8px;
  font-size: 15px;
}
.sf p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}
.cmd {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--bg);
  border: 1px solid var(--bd);
  border-radius: 8px;
  padding: 10px 12px;
}
.cmd pre {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.det summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--mu);
}
.log .e {
  color: var(--dg);
}
.mu {
  color: var(--mu);
}
.bar {
  position: relative;
  height: 6px;
}
.ind {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 30%;
  background: var(--ac);
  border-radius: 3px;
  animation: ind 1.2s ease-in-out infinite;
}
@keyframes ind {
  0% {
    left: -30%;
  }
  100% {
    left: 100%;
  }
}
</style>
