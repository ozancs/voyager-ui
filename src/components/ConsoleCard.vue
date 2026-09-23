<script setup>
import Icon from './Icon.vue'
import ConsoleView from './ConsoleView.vue'
import { state } from '../store'
import { go } from '../router'
</script>
<template>
  <section class="card">
    <div class="card-h"><h2>Console</h2><div class="acts"><button class="btn" :class="{ out: state.settings.consoleHideTemps }" @click="state.settings.consoleHideTemps = !state.settings.consoleHideTemps">Hide temps</button><button class="btn" @click="state.console = []">Clear</button><button class="btn" @click="go('console')"><Icon name="ext" :size="16" :stroke="2.4" />Open</button></div></div>
    <ConsoleView :limit="200" />
  </section>
</template>
