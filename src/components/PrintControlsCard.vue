<script setup>
// Print controls: speed factor and flow, the two values that change during a print, with a quick way back to 100%.
// While this card is on the dashboard the Machine Limits card leaves them out.
import SpeedFlow from './SpeedFlow.vue';
import { t } from '../i18n';
</script>
<template>
  <section class="card spread">
    <div class="card-h">
      <h2>{{ t('Print controls') }}</h2>
    </div>
    <SpeedFlow resets />
  </section>
</template>
<style scoped>
.card {
  overflow: auto;
}
</style>
