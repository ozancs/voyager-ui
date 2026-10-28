<script setup>
// Print controls: speed factor and flow, the two values that change during a print, with a quick way back to 100%.
// While this card is on the dashboard the Machine Limits card leaves them out. Its option: the two one under the
// other instead of side by side when the card is wide.
import CardTitle from './CardTitle.vue';
import CardCollapse from './CardCollapse.vue';
import SpeedFlow from './SpeedFlow.vue';
import { t } from '../i18n';
import { state } from '../store';
</script>
<template>
  <section class="card spread">
    <div class="card-h">
      <CardTitle :text="t('Print controls')" />
      <CardCollapse />
    </div>
    <SpeedFlow resets :stack="!!state.settings.cardOpts?.printctl?.stack" />
  </section>
</template>
<style scoped>
.card {
  overflow: auto;
}
</style>
