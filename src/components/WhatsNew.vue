<script setup>
// What's new: the project's CHANGELOG.md, shown in the UI. The file is loaded only when this dialog opens
// (its own chunk), so it costs nothing on a normal page load. Opened from the version in the footer, from
// Settings, and once by itself after an update.
import { ref, computed, watch } from 'vue';
import Modal from './Modal.vue';
import { state, VERSION, saveSettings } from '../store';
import { t } from '../i18n';
const text = ref(null);
const failed = ref(false);
watch(
  () => state.whatsNew,
  async (open) => {
    if (!open || text.value) return;
    try {
      text.value = (await import('../../CHANGELOG.md?raw')).default;
    } catch {
      failed.value = true;
    }
  },
);
// "## 0.23.4" starts a release, "- ..." lines are its entries
const releases = computed(() => {
  const out = [];
  for (const line of String(text.value || '').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) out.push({ v: h[1], items: [] });
    else if (/^\s*-\s+/.test(line) && out.length) out[out.length - 1].items.push(line.replace(/^\s*-\s+/, ''));
  }
  return out;
});
function close() {
  state.whatsNew = false;
  if (state.settings.seenVersion !== VERSION) {
    state.settings.seenVersion = VERSION;
    saveSettings();
  }
}
</script>
<template>
  <Modal v-if="state.whatsNew" :title="t('What’s new')" width="680px" @close="close">
    <div v-if="failed" class="empty">{{ t('The changelog could not be loaded.') }}</div>
    <div v-else-if="!releases.length" class="empty">{{ t('Loading…') }}</div>
    <div v-else class="log">
      <section v-for="r in releases" :key="r.v">
        <h3 :class="{ cur: r.v === VERSION }">
          {{ r.v }}<span v-if="r.v === VERSION" class="now">{{ t('installed') }}</span>
        </h3>
        <ul>
          <li v-for="(i, k) in r.items" :key="k">{{ i }}</li>
        </ul>
      </section>
    </div>
    <template #foot>
      <button class="btn lg acc" @click="close">{{ t('Close') }}</button>
    </template>
  </Modal>
</template>
<style scoped>
.log {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-height: 62vh;
  overflow: auto;
  padding-right: 4px;
}
h3 {
  margin: 0 0 6px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
h3.cur {
  color: var(--ac);
}
.now {
  font-size: 11px;
  font-weight: 400;
  color: var(--mu);
}
ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
li {
  font-size: 13px;
  line-height: 1.5;
}
.empty {
  padding: 20px;
  color: var(--mu);
}
</style>
