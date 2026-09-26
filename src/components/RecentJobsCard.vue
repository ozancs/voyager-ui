<script setup>
import { ref, onMounted } from 'vue';
import Icon from './Icon.vue';
import { fmtTime, fmtDate, toast, isPrinting, useApiEvent } from '../store';
import { api } from '../api/moonraker';
import { go } from '../router';
import { t } from '../i18n';

const jobs = ref([]);
async function load() {
  try {
    jobs.value = (await api.call('server.history.list', { limit: 12, order: 'desc' })).jobs || [];
  } catch {}
}
onMounted(load);
useApiEvent('notify_history_changed', () => setTimeout(load, 500));
const COL = {
  completed: 'var(--mu)',
  cancelled: 'var(--mu2)',
  error: 'var(--dg)',
  klippy_shutdown: 'var(--dg)',
  in_progress: 'var(--tx)',
  interrupted: 'var(--wn)',
};
const reprint = (j) =>
  api
    .call('printer.print.start', { filename: j.filename })
    .then(() => toast(t('Print started')))
    .catch((e) => toast(e.message, 'error'));
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ t('Recent prints') }}</h2>
      <button class="btn clear" @click="go('history')">{{ t('History') }}</button>
    </div>
    <div class="list">
      <div v-for="j in jobs" :key="j.job_id" class="jr">
        <span class="d" :style="{ background: COL[j.status] || 'var(--mu)' }" :title="j.status"></span>
        <div class="col grow" style="gap: 1px; min-width: 0">
          <b class="fn">{{ j.filename }}</b
          ><span class="mono mu"
            >{{ fmtTime(j.print_duration) }} · {{ fmtDate(j.start_time) }} · {{ t(j.status) }}</span
          >
        </div>
        <button
          class="btn ibtn sm"
          :aria-label="t('Print again')"
          :disabled="isPrinting || !j.exists"
          @click="reprint(j)"
        >
          <Icon name="refresh" :size="15" />
        </button>
      </div>
      <div v-if="!jobs.length" class="empty">{{ t('No prints yet') }}</div>
    </div>
  </section>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.jr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-radius: 10px;
}
.jr:hover {
  background: var(--s2);
}
.d {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  flex-shrink: 0;
}
.fn {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mu {
  color: var(--mu);
  font-size: 11.5px;
}
</style>
