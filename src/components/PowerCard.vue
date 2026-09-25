<script setup>
import Icon from './Icon.vue'
import PowerList from './PowerList.vue'
import { loadPower } from '../store'
import { t } from '../i18n'
</script>
<template>
  <section class="card">
    <div class="card-h"><h2>{{ t('Power') }}</h2><button class="btn clear ibtn sm" :aria-label="t('Refresh')" @click="loadPower"><Icon name="refresh" :size="16" /></button></div>
    <PowerList />
  </section>
</template>
