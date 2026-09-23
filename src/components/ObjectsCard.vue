<script setup>
import Icon from './Icon.vue'
import ObjectMap from './ObjectMap.vue'
import { state, S } from '../store'
</script>
<template>
  <section class="card">
    <div class="card-h"><h2>Objects</h2><button class="btn out" :disabled="!S('exclude_object').objects?.length" @click="state.showExclude = true"><Icon name="excl" :size="16" />Exclude…</button></div>
    <ObjectMap style="flex:1;min-height:0" @pick="state.showExclude = true" />
  </section>
</template>
