<script setup>
import Icon from './Icon.vue'
import { t } from '../i18n'
defineProps({ title: String, width: { type: String, default: '520px' } })
const emit = defineEmits(['close'])
</script>
<template>
  <Teleport to="body">
  <div class="ov" @mousedown.self="emit('close')">
    <div class="md card" :style="{ width }" role="dialog" :aria-label="title">
      <div class="card-h"><h2>{{ title }}</h2><button class="btn clear ibtn sm" :aria-label="t('Close')" @click="emit('close')"><Icon name="x" :size="18" /></button></div>
      <slot />
      <div v-if="$slots.foot" class="row" style="justify-content:flex-end"><slot name="foot" /></div>
    </div>
  </div>
  </Teleport>
</template>
<style scoped>
.ov { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
.md { max-width: 100%; max-height: 90vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
</style>
