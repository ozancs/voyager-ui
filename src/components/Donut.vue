<script setup>
// Small ring gauge (a value out of max) used for CPU, memory and MCU load.
import { computed } from 'vue';
const props = defineProps({
  value: Number,
  max: { type: Number, default: 100 },
  label: String,
  size: { type: Number, default: 52 },
  color: { type: String, default: 'var(--ac)' },
});
const r = 20,
  c = 2 * Math.PI * r;
const frac = computed(() => Math.max(0, Math.min(1, (props.value || 0) / props.max)));
</script>
<template>
  <div class="dn">
    <svg :width="size" :height="size" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" :r="r" fill="none" stroke="var(--s3)" stroke-width="5" />
      <circle
        cx="24"
        cy="24"
        :r="r"
        fill="none"
        :stroke="color"
        stroke-width="5"
        stroke-linecap="round"
        :stroke-dasharray="`${frac * c} ${c}`"
        transform="rotate(-90 24 24)"
      />
      <text
        x="24"
        y="28"
        text-anchor="middle"
        font-size="12"
        font-weight="700"
        fill="var(--tx)"
        font-family="Onest, sans-serif"
      >
        {{ Math.round(value || 0) }}
      </text>
    </svg>
    <span v-if="label" class="lb">{{ label }}</span>
  </div>
</template>
<style scoped>
.dn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.lb {
  font-size: 12px;
  font-weight: 500;
  color: var(--mu);
}
</style>
