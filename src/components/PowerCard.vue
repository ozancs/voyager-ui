<script setup>
// Dashboard card listing Moonraker power devices ([power] sections) with on/off switches.
import CardTitle from './CardTitle.vue';
import Icon from './Icon.vue';
import CardCollapse from './CardCollapse.vue';
import PowerList from './PowerList.vue';
import { loadPower } from '../store';
import { t } from '../i18n';
</script>
<template>
  <section class="card">
    <div class="card-h">
      <CardTitle :text="t('Power')" />
      <button class="btn clear ibtn sm" :aria-label="t('Refresh')" @click="loadPower">
        <Icon name="refresh" :size="16" />
      </button>
      <CardCollapse />
    </div>
    <PowerList />
  </section>
</template>
