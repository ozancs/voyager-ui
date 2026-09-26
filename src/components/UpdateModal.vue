<script setup>
// Log of a running update (Moonraker's update manager). Shows the output lines as they come in
// and a close button when the update is done.
import { ref, watch, nextTick, computed } from 'vue';
import Icon from './Icon.vue';
import { state } from '../store';
import { t } from '../i18n';
const box = ref(null);
const u = computed(() => state.update);
watch(
  () => state.update?.lines.length,
  () =>
    nextTick(() => {
      if (box.value) box.value.scrollTop = box.value.scrollHeight;
    }),
);
const failed = computed(() => u.value?.lines.some((l) => /^!!|error|failed/i.test(l)));
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
          />{{ u.app === 'all' ? t('Updating everything') : t('Updating {name}', { name: u.app }) }}
        </h2>
        <span class="chip" :style="{ color: u.complete ? (failed ? 'var(--dg)' : 'var(--ok)') : 'var(--ac)' }"
          ><i></i>{{ u.complete ? (failed ? t('Finished with errors') : t('Complete')) : t('Running') }}</span
        >
      </div>
      <div ref="box" class="log mono">
        <div v-if="!u.lines.length" class="mu">{{ t('Waiting for Moonraker…') }}</div>
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
