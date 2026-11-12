<script setup>
// Dashboard card with the console (ConsoleView) and its header buttons: hide temperature reports, copy the log,
// clear, open the full console page.
import { ref } from 'vue';
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import ConsoleView from './ConsoleView.vue';
import { state, clearConsole } from '../store';
import { go } from '../router';
import { t } from '../i18n';
const cv = ref(null);
</script>
<template>
  <section class="card">
    <div class="card-h">
      <CardTitle :text="t('Console')" />
      <div class="acts">
        <button
          class="btn ibtn"
          :class="{ on: state.settings.consoleHideTemps }"
          :aria-pressed="!!state.settings.consoleHideTemps"
          :aria-label="t('Hide temps')"
          :data-tip="state.settings.consoleHideTemps ? t('Show temperature lines') : t('Hide temperature lines')"
          @click="state.settings.consoleHideTemps = !state.settings.consoleHideTemps"
        >
          <Icon name="thermo" :size="16" /></button
        ><button
          class="btn ibtn"
          :aria-label="t('Copy console')"
          :data-tip="cv?.copied === 'all' ? t('Copied') : t('Copy console')"
          @click="cv?.copyAll()"
        >
          <Icon :name="cv?.copied === 'all' ? 'check' : 'copy'" :size="15" /></button
        ><button class="btn" @click="clearConsole">{{ t('Clear') }}</button
        ><button class="btn ibtn" :aria-label="t('Open')" :data-tip="t('Open the console page')" @click="go('console')">
          <Icon name="ext" :size="16" :stroke="2.4" />
        </button>
      </div>
      <CardCollapse />
    </div>
    <ConsoleView ref="cv" :limit="200" />
  </section>
</template>
