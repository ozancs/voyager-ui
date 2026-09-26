<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { state, activeTasks } from '../store';
import { t } from '../i18n';
defineProps({ title: { type: String, default: 'Loading…' }, compact: Boolean });
const now = ref(Date.now());
let timer;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 250);
});
onBeforeUnmount(() => clearInterval(timer));
const secs = (x) => ((now.value - x.t) / 1000).toFixed(1);
</script>
<template>
  <div class="lp" :class="{ compact }">
    <div class="hd">
      <Icon name="refresh" :size="compact ? 18 : 22" class="spin" /><b>{{ t(title) }}</b>
    </div>
    <div class="list">
      <div v-for="x in activeTasks" :key="x.id" class="it">
        <span class="dot"></span><span class="grow">{{ x.label }}</span
        ><span class="mono s">{{ secs(x) }}s</span>
      </div>
      <div v-if="!activeTasks.length" class="it mu">
        <span class="dot"></span
        ><span>{{ state.connected ? t('Preparing the page') : t('Waiting for Moonraker') }}</span>
      </div>
    </div>
  </div>
</template>
<style scoped>
.lp {
  margin: 8vh auto 0;
  width: min(420px, 100%);
  background: var(--s1);
  border-radius: var(--r);
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.lp.compact {
  margin: 24px auto;
}
.hd {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
}
.hd :deep(svg) {
  color: var(--heat);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.it {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  color: var(--tx);
}
.it.mu {
  color: var(--mu);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--heat);
  animation: pulse 1s ease-in-out infinite;
  flex-shrink: 0;
}
.s {
  color: var(--mu2);
  font-size: 12px;
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
}
</style>
