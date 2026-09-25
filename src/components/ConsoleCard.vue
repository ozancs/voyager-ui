<script setup>
import Icon from './Icon.vue'
import ConsoleView from './ConsoleView.vue'
import { state } from '../store'
import { go } from '../router'
import { t } from '../i18n'
</script>
<template>
  <section class="card">
    <div class="card-h"><h2>{{ t('Console') }}</h2><div class="acts"><button class="btn" :class="{ on: state.settings.consoleHideTemps }" :aria-pressed="!!state.settings.consoleHideTemps" @click="state.settings.consoleHideTemps = !state.settings.consoleHideTemps">{{ t('Hide temps') }}</button><button class="btn" @click="state.console = []">{{ t('Clear') }}</button><button class="btn" @click="go('console')"><Icon name="ext" :size="16" :stroke="2.4" />{{ t('Open') }}</button></div></div>
    <ConsoleView :limit="200" />
  </section>
</template>
