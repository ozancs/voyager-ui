<script setup>
// Dashboard card with the console (ConsoleView) and its header buttons: hide temperature reports, clear,
// open the full console page.
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import ConsoleView from './ConsoleView.vue';
import { state, clearConsole } from '../store';
import { go } from '../router';
import { t } from '../i18n';
</script>
<template>
  <section class="card">
    <div class="card-h">
      <CardTitle :text="t('Console')" />
      <div class="acts">
        <button
          class="btn"
          :class="{ on: state.settings.consoleHideTemps }"
          :aria-pressed="!!state.settings.consoleHideTemps"
          @click="state.settings.consoleHideTemps = !state.settings.consoleHideTemps"
        >
          {{ t('Hide temps') }}</button
        ><button class="btn" @click="clearConsole">{{ t('Clear') }}</button
        ><button class="btn" @click="go('console')"><Icon name="ext" :size="16" :stroke="2.4" />{{ t('Open') }}</button>
      </div>
      <CardCollapse />
    </div>
    <ConsoleView :limit="200" />
  </section>
</template>
