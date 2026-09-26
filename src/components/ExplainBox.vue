<script setup>
// Plain-words explanation of a Klipper error (explain.js): what it means, the usual cause, what to check.
import { t } from '../i18n';
defineProps({ e: Object });
</script>
<template>
  <div class="ex">
    <b>{{ t(e.title) }}</b>
    <p>
      <span class="k">{{ t('Usual cause') }}</span
      >{{ t(e.cause) }}
    </p>
    <p>
      <span class="k">{{ t('What to check') }}</span
      >{{ t(e.fix) }}
    </p>
  </div>
</template>
<style scoped>
.ex {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
  white-space: normal;
}
.ex p {
  margin: 0;
}
.k {
  display: block;
  font-size: 11.5px;
  color: var(--mu);
}
</style>
