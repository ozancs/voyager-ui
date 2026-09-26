<script setup>
// Small dashboard card with the health issues found by features.js (MCU errors, throttling, driver
// flags, due maintenance). Details are on the Health page.
import Icon from './Icon.vue';
import { healthIssues, dueMaintenance } from '../features';
import { go } from '../router';
import { t } from '../i18n';
const LV = { warn: 'var(--wn)', error: 'var(--dg)', info: 'var(--bl)' };
</script>

<template>
  <section class="card" :class="healthIssues.some((i) => i.level !== 'info') ? 't-heat' : 't-sense'">
    <div class="card-h">
      <h2>{{ t('Health') }}</h2>
      <button class="btn clear" @click="go('health')">{{ t('Details') }}</button>
    </div>
    <div v-if="!healthIssues.length" class="row ok">
      <Icon name="heart" :size="22" /><span>{{ t('Everything looks healthy') }}</span>
    </div>
    <div v-else class="list">
      <div v-for="i in healthIssues" :key="i.area + i.key + i.msg" class="is">
        <span class="d" :style="{ background: LV[i.level] }"></span>{{ i.msg }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.ok {
  color: var(--ok);
  font-weight: 600;
  gap: 10px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  min-height: 0;
}
.is {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.d {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  flex-shrink: 0;
}
</style>
